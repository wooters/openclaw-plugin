import { Type } from "@sinclair/typebox";
import type {
  ChannelAccountSnapshot,
  ChannelGatewayContext,
  ChannelPlugin,
  OpenClawConfig,
  ReplyPayload,
} from "openclaw/plugin-sdk";
import {
  createReplyPrefixOptions,
  DEFAULT_ACCOUNT_ID,
  normalizeAccountId,
} from "openclaw/plugin-sdk";
import { validateConfig } from "./config.js";
import { getCrabCallrRuntime } from "./runtime.js";
import type {
  CrabCallrAccountConfig,
  CrabCallrChannelConfig,
  ConnectionStatus,
} from "./types.js";
import { CrabCallrWebSocket } from "./websocket.js";

const CHANNEL_ID = "crabcallr";

type ResolvedCrabCallrAccount = {
  accountId: string;
  name?: string;
  enabled: boolean;
  configured: boolean;
  config: CrabCallrAccountConfig;
};

type CrabCallrConnection = {
  accountId: string;
  ws: CrabCallrWebSocket;
  statusSink?: (patch: Partial<ChannelAccountSnapshot>) => void;
};

const connections = new Map<string, CrabCallrConnection>();

const CrabCallrAccountSchema = Type.Object(
  {
    name: Type.Optional(Type.String()),
    enabled: Type.Optional(Type.Boolean()),
    apiKey: Type.Optional(
      Type.String({
        description: "Your CrabCallr API key from app.crabcallr.com",
      }),
    ),
    serviceUrl: Type.Optional(
      Type.String({
        description: "CrabCallr service WebSocket URL",
        default: "wss://ws.crabcallr.com/plugin",
      }),
    ),
    autoConnect: Type.Optional(
      Type.Boolean({
        description: "Automatically connect to CrabCallr service on startup",
        default: true,
      }),
    ),
    reconnectInterval: Type.Optional(
      Type.Number({
        description: "Reconnection interval in milliseconds",
        default: 5000,
      }),
    ),
    maxReconnectAttempts: Type.Optional(
      Type.Number({
        description: "Maximum number of reconnection attempts (0 for unlimited)",
        default: 10,
      }),
    ),
  },
  { additionalProperties: false },
);

const CrabCallrChannelSchema = Type.Object(
  {
    ...CrabCallrAccountSchema.properties,
    accounts: Type.Optional(Type.Record(Type.String(), CrabCallrAccountSchema)),
  },
  { additionalProperties: false },
);

const crabcallrConfigSchema = {
  schema: CrabCallrChannelSchema,
  uiHints: {
    apiKey: {
      label: "CrabCallr API Key",
      sensitive: true,
      placeholder: "cc_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    },
    serviceUrl: {
      label: "Service URL",
      advanced: true,
    },
    autoConnect: {
      label: "Auto-connect on startup",
    },
    reconnectInterval: {
      label: "Reconnect interval (ms)",
      advanced: true,
    },
    maxReconnectAttempts: {
      label: "Max reconnect attempts",
      advanced: true,
    },
  },
};

function resolveChannelConfig(cfg: OpenClawConfig): CrabCallrChannelConfig {
  const channel = cfg.channels?.crabcallr;
  if (!channel || typeof channel !== "object") {
    return {};
  }
  return channel as CrabCallrChannelConfig;
}

function hasBaseConfig(cfg: CrabCallrChannelConfig): boolean {
  return Boolean(
    cfg.apiKey ||
      cfg.serviceUrl ||
      typeof cfg.autoConnect === "boolean" ||
      typeof cfg.reconnectInterval === "number" ||
      typeof cfg.maxReconnectAttempts === "number" ||
      typeof cfg.enabled === "boolean" ||
      cfg.name,
  );
}

function listCrabCallrAccountIds(cfg: OpenClawConfig): string[] {
  const channel = resolveChannelConfig(cfg);
  const ids = new Set<string>();
  if (hasBaseConfig(channel)) {
    ids.add(DEFAULT_ACCOUNT_ID);
  }
  const accounts = channel.accounts;
  if (accounts && typeof accounts === "object") {
    for (const key of Object.keys(accounts)) {
      if (!key) {
        continue;
      }
      ids.add(normalizeAccountId(key));
    }
  }
  if (ids.size === 0) {
    ids.add(DEFAULT_ACCOUNT_ID);
  }
  return [...ids].sort((a, b) => a.localeCompare(b));
}

function resolveAccountConfig(cfg: OpenClawConfig, accountId: string): CrabCallrAccountConfig {
  const channel = resolveChannelConfig(cfg);
  const { accounts: _ignored, ...base } = channel;
  const accounts = channel.accounts ?? {};
  const direct = accounts[accountId];
  if (direct) {
    return { ...base, ...direct };
  }
  const normalized = normalizeAccountId(accountId);
  const matchKey = Object.keys(accounts).find(
    (key) => normalizeAccountId(key) === normalized,
  );
  const resolved = matchKey ? accounts[matchKey] : undefined;
  return { ...base, ...(resolved ?? {}) };
}

function resolveDefaultCrabCallrAccountId(cfg: OpenClawConfig): string {
  const ids = listCrabCallrAccountIds(cfg);
  if (ids.includes(DEFAULT_ACCOUNT_ID)) {
    return DEFAULT_ACCOUNT_ID;
  }
  return ids[0] ?? DEFAULT_ACCOUNT_ID;
}

function resolveCrabCallrAccount(params: {
  cfg: OpenClawConfig;
  accountId?: string | null;
}): ResolvedCrabCallrAccount {
  const id = normalizeAccountId(params.accountId ?? DEFAULT_ACCOUNT_ID);
  const merged = resolveAccountConfig(params.cfg, id);
  const channel = resolveChannelConfig(params.cfg);
  const enabled = (channel.enabled ?? true) && merged.enabled !== false;
  const configured = Boolean(merged.apiKey?.trim());
  return {
    accountId: id,
    name: merged.name?.trim() || undefined,
    enabled,
    configured,
    config: merged,
  };
}

function createStatusSink(ctx: {
  accountId: string;
  getStatus?: () => ChannelAccountSnapshot;
  setStatus?: (next: ChannelAccountSnapshot) => void;
}) {
  return (patch: Partial<ChannelAccountSnapshot>) => {
    const base = ctx.getStatus?.() ?? { accountId: ctx.accountId };
    ctx.setStatus?.({ ...base, ...patch, accountId: ctx.accountId });
  };
}

async function handleRequest(params: {
  cfg: OpenClawConfig;
  accountId: string;
  requestId: string;
  text: string;
  callId: string;
  ws: CrabCallrWebSocket;
  statusSink?: (patch: Partial<ChannelAccountSnapshot>) => void;
  logError: (message: string) => void;
}) {
  const { cfg, accountId, requestId, text, callId, ws, statusSink, logError } = params;
  const core = getCrabCallrRuntime();
  const route = core.channel.routing.resolveAgentRoute({
    cfg,
    channel: CHANNEL_ID,
    accountId,
    peer: {
      kind: "dm",
      id: callId,
    },
  });

  const storePath = core.channel.session.resolveStorePath(cfg.session?.store, {
    agentId: route.agentId,
  });
  const envelopeOptions = core.channel.reply.resolveEnvelopeFormatOptions(cfg);
  const previousTimestamp = core.channel.session.readSessionUpdatedAt({
    storePath,
    sessionKey: route.sessionKey,
  });
  const body = core.channel.reply.formatAgentEnvelope({
    channel: "CrabCallr",
    from: "Voice Caller",
    timestamp: Date.now(),
    previousTimestamp,
    envelope: envelopeOptions,
    body: text,
  });

  const ctxPayload = core.channel.reply.finalizeInboundContext({
    Body: body,
    RawBody: text,
    CommandBody: text,
    From: `crabcallr:call:${callId}`,
    To: `crabcallr:call:${callId}`,
    SessionKey: route.sessionKey,
    AccountId: route.accountId,
    ChatType: "direct",
    ConversationLabel: `call:${callId}`,
    SenderName: "Voice Caller",
    SenderId: callId,
    Provider: CHANNEL_ID,
    Surface: CHANNEL_ID,
    MessageSid: requestId,
    Timestamp: Date.now(),
    OriginatingChannel: CHANNEL_ID,
    OriginatingTo: `crabcallr:call:${callId}`,
  });

  await core.channel.session.recordInboundSession({
    storePath,
    sessionKey: ctxPayload.SessionKey ?? route.sessionKey,
    ctx: ctxPayload,
    onRecordError: (err: unknown) => {
      logError(`[CrabCallr] Failed updating session meta: ${String(err)}`);
    },
  });

  const { onModelSelected, ...prefixOptions } = createReplyPrefixOptions({
    cfg,
    agentId: route.agentId,
    channel: CHANNEL_ID,
    accountId: route.accountId,
  });

  await core.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
    ctx: ctxPayload,
    cfg,
    dispatcherOptions: {
      ...prefixOptions,
      deliver: async (
        payload: ReplyPayload,
        info: { kind: "tool" | "block" | "final" },
      ) => {
        if (info.kind !== "final") {
          return;
        }
        const replyText = payload.text?.trim();
        if (!replyText) {
          return;
        }
        ws.sendResponse(requestId, replyText);
        statusSink?.({ lastOutboundAt: Date.now() });
      },
      onError: (err: unknown, info: { kind: "tool" | "block" | "final" }) => {
        logError(`[CrabCallr] ${info.kind} reply failed: ${String(err)}`);
      },
    },
    replyOptions: {
      onModelSelected,
      disableBlockStreaming: true,
    },
  });
}

function getConnection(accountId: string): CrabCallrConnection | undefined {
  return connections.get(normalizeAccountId(accountId));
}

export function getCrabCallrStatus(accountId?: string): {
  accountId: string;
  connected: boolean;
  status: ConnectionStatus;
  userId: string | null;
  running: boolean;
  reconnectAttempts: number;
} {
  const resolvedId = normalizeAccountId(accountId ?? DEFAULT_ACCOUNT_ID);
  const record = connections.get(resolvedId);
  if (!record) {
    return {
      accountId: resolvedId,
      connected: false,
      status: "disconnected",
      userId: null,
      running: false,
      reconnectAttempts: 0,
    };
  }
  return {
    accountId: resolvedId,
    connected: record.ws.isConnected(),
    status: record.ws.getStatus(),
    userId: record.ws.getUserId(),
    running: true,
    reconnectAttempts: record.ws.getReconnectAttempts(),
  };
}

export function sendCrabCallrResponse(params: {
  accountId?: string;
  requestId: string;
  text: string;
}): { ok: boolean; error?: string } {
  const resolvedId = normalizeAccountId(params.accountId ?? DEFAULT_ACCOUNT_ID);
  const record = connections.get(resolvedId);
  if (!record) {
    return { ok: false, error: "CrabCallr connection not running" };
  }
  if (!record.ws.isConnected()) {
    return { ok: false, error: "CrabCallr is not connected" };
  }
  record.ws.sendResponse(params.requestId, params.text);
  record.statusSink?.({ lastOutboundAt: Date.now() });
  return { ok: true };
}

export const crabcallrPlugin: ChannelPlugin<ResolvedCrabCallrAccount> = {
  id: CHANNEL_ID,
  meta: {
    id: CHANNEL_ID,
    label: "CrabCallr Voice",
    selectionLabel: "CrabCallr (Voice)",
    docsPath: "/channels/crabcallr",
    blurb: "Voice calling via phone or browser",
    aliases: ["voice", "phone"],
    order: 100,
  },
  capabilities: {
    chatTypes: ["direct"],
    blockStreaming: true,
  },
  reload: { configPrefixes: ["channels.crabcallr"] },
  configSchema: crabcallrConfigSchema,
  config: {
    listAccountIds: (cfg: OpenClawConfig) => listCrabCallrAccountIds(cfg),
    resolveAccount: (cfg: OpenClawConfig, accountId?: string | null) =>
      resolveCrabCallrAccount({ cfg, accountId }),
    defaultAccountId: (cfg: OpenClawConfig) => resolveDefaultCrabCallrAccountId(cfg),
    isConfigured: (account: ResolvedCrabCallrAccount) => account.configured,
    isEnabled: (account: ResolvedCrabCallrAccount) => account.enabled,
    describeAccount: (account: ResolvedCrabCallrAccount) => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: account.configured,
    }),
  },
  gateway: {
    startAccount: async (ctx: ChannelGatewayContext<ResolvedCrabCallrAccount>) => {
      const account = ctx.account;
      if (!account.enabled) {
        ctx.log?.info(`[${account.accountId}] CrabCallr disabled`);
        ctx.setStatus?.({
          accountId: account.accountId,
          running: false,
          connected: false,
          lastStopAt: Date.now(),
        });
        return;
      }

      let config: ReturnType<typeof validateConfig>;
      try {
        config = validateConfig({
          apiKey: account.config.apiKey,
          serviceUrl: account.config.serviceUrl,
          autoConnect: account.config.autoConnect,
          reconnectInterval: account.config.reconnectInterval,
          maxReconnectAttempts: account.config.maxReconnectAttempts,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        ctx.setStatus?.({
          accountId: account.accountId,
          running: false,
          connected: false,
          lastError: message,
          lastStopAt: Date.now(),
        });
        throw err;
      }

      const logger =
        ctx.log ??
        ({
          info: console.log,
          warn: console.warn,
          error: console.error,
          debug: console.debug,
        } as const);
      const statusSink = createStatusSink({
        accountId: account.accountId,
        getStatus: ctx.getStatus,
        setStatus: ctx.setStatus,
      });

      const ws = new CrabCallrWebSocket(config, logger);
      connections.set(account.accountId, { accountId: account.accountId, ws, statusSink });

      statusSink({
        running: true,
        connected: ws.isConnected(),
        lastStartAt: Date.now(),
        lastError: null,
        reconnectAttempts: ws.getReconnectAttempts(),
      });

      ws.on("connected", () => {
        statusSink({
          connected: true,
          lastConnectedAt: Date.now(),
          lastDisconnect: null,
          reconnectAttempts: ws.getReconnectAttempts(),
          lastError: null,
        });
      });

      ws.on("disconnected", (reason) => {
        statusSink({
          connected: false,
          lastDisconnect: {
            at: Date.now(),
            error: reason,
          },
          reconnectAttempts: ws.getReconnectAttempts(),
        });
      });

      ws.on("error", (error) => {
        statusSink({
          lastError: error.message,
          reconnectAttempts: ws.getReconnectAttempts(),
        });
      });

      ws.on("request", (requestId, text, callId) => {
        statusSink({ lastInboundAt: Date.now() });
        handleRequest({
          cfg: ctx.cfg,
          accountId: account.accountId,
          requestId,
          text,
          callId,
          ws,
          statusSink,
          logError: (message) => logger.error(message),
        }).catch((err) => {
          logger.error(`[CrabCallr] Failed to handle request: ${String(err)}`);
        });
      });

      ws.on("callStart", (callId, source) => {
        logger.info(`[CrabCallr] Call started from ${source}: ${callId}`);
      });

      ws.on("callEnd", (callId, durationSeconds, source) => {
        logger.info(
          `[CrabCallr] Call ended: ${callId} (${durationSeconds}s from ${source})`,
        );
      });

      const stop = () => {
        ws.disconnect();
        connections.delete(account.accountId);
        statusSink({
          running: false,
          connected: false,
          lastStopAt: Date.now(),
        });
      };

      ctx.abortSignal.addEventListener("abort", stop, { once: true });

      if (config.autoConnect) {
        logger.info("[CrabCallr] Auto-connecting to CrabCallr service");
        ws.connect();
      }
    },
    stopAccount: async (ctx: ChannelGatewayContext<ResolvedCrabCallrAccount>) => {
      const record = getConnection(ctx.accountId);
      if (record) {
        record.ws.disconnect();
        connections.delete(record.accountId);
      }
      ctx.setStatus?.({
        accountId: ctx.accountId,
        running: false,
        connected: false,
        lastStopAt: Date.now(),
      });
    },
  },
  status: {
    defaultRuntime: {
      accountId: DEFAULT_ACCOUNT_ID,
      running: false,
      connected: false,
      lastStartAt: null,
      lastStopAt: null,
      lastError: null,
    },
    buildAccountSnapshot: ({
      account,
      runtime,
    }: {
      account: ResolvedCrabCallrAccount;
      runtime?: ChannelAccountSnapshot;
    }) => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: account.configured,
      running: runtime?.running ?? false,
      connected: runtime?.connected ?? false,
      reconnectAttempts: runtime?.reconnectAttempts ?? 0,
      lastConnectedAt: runtime?.lastConnectedAt ?? null,
      lastDisconnect: runtime?.lastDisconnect ?? null,
      lastError: runtime?.lastError ?? null,
      lastStartAt: runtime?.lastStartAt ?? null,
      lastStopAt: runtime?.lastStopAt ?? null,
      lastInboundAt: runtime?.lastInboundAt ?? null,
      lastOutboundAt: runtime?.lastOutboundAt ?? null,
    }),
  },
};
