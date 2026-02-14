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
  CrabCallrConfig,
  CrabCallrLogger,
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

type CallState = {
  callId: string;
  lastActivityAt: number;
  idlePromptCount: number;
  idleCheckInterval: NodeJS.Timeout | null;
  currentRequestId: string | null;
  fillerTimer: NodeJS.Timeout | null;
  fillerCount: number;
  fillerPhraseIndex: number;
};

type CrabCallrConnection = {
  accountId: string;
  ws: CrabCallrWebSocket;
  statusSink?: (patch: Partial<ChannelAccountSnapshot>) => void;
  callStates: Map<string, CallState>;
};

const connections = new Map<string, CrabCallrConnection>();

const IDLE_CHECK_INTERVAL_MS = 10_000; // Check idle every 10 seconds

function createCallState(callId: string): CallState {
  return {
    callId,
    lastActivityAt: Date.now(),
    idlePromptCount: 0,
    idleCheckInterval: null,
    currentRequestId: null,
    fillerTimer: null,
    fillerCount: 0,
    fillerPhraseIndex: 0,
  };
}

function clearCallState(state: CallState): void {
  if (state.fillerTimer) {
    clearTimeout(state.fillerTimer);
    state.fillerTimer = null;
  }
  if (state.idleCheckInterval) {
    clearInterval(state.idleCheckInterval);
    state.idleCheckInterval = null;
  }
}

function clearAllCallStates(callStates: Map<string, CallState>): void {
  for (const state of callStates.values()) {
    clearCallState(state);
  }
  callStates.clear();
}

function startFillerTimer(
  state: CallState,
  config: CrabCallrConfig,
  ws: CrabCallrWebSocket,
  logger: CrabCallrLogger,
): void {
  if (!config.fillers.enabled || config.fillers.maxPerRequest <= 0) return;

  const { phrases, initialDelaySec, intervalSec, maxPerRequest } = config.fillers;
  if (phrases.length === 0) return;

  state.fillerCount = 0;

  const sendFiller = () => {
    if (!state.currentRequestId) return;
    if (state.fillerCount >= maxPerRequest) return;

    const phrase = phrases[state.fillerPhraseIndex % phrases.length];
    state.fillerPhraseIndex++;
    state.fillerCount++;

    logger.debug?.(`[CrabCallr] Sending filler for ${state.currentRequestId}: "${phrase}"`);
    ws.sendFiller(state.currentRequestId, phrase);

    if (state.fillerCount < maxPerRequest) {
      state.fillerTimer = setTimeout(sendFiller, intervalSec * 1000);
    } else {
      state.fillerTimer = null;
    }
  };

  state.fillerTimer = setTimeout(sendFiller, initialDelaySec * 1000);
}

function clearFillerTimer(state: CallState): void {
  if (state.fillerTimer) {
    clearTimeout(state.fillerTimer);
    state.fillerTimer = null;
  }
  state.currentRequestId = null;
  state.fillerCount = 0;
}

function startIdleCheckInterval(
  state: CallState,
  config: CrabCallrConfig,
  ws: CrabCallrWebSocket,
  logger: CrabCallrLogger,
): void {
  if (!config.idle.enabled) return;

  state.idleCheckInterval = setInterval(() => {
    // Don't prompt while a request is in-flight
    if (state.currentRequestId !== null) return;

    const elapsed = Date.now() - state.lastActivityAt;
    if (elapsed < config.idle.timeoutSec * 1000) return;

    if (state.idlePromptCount < config.idle.maxPrompts) {
      state.idlePromptCount++;
      state.lastActivityAt = Date.now(); // Reset so next prompt waits another full timeout
      logger.info(`[CrabCallr] Idle prompt ${state.idlePromptCount}/${config.idle.maxPrompts} for call ${state.callId}`);
      ws.sendSpeak(state.callId, config.idle.prompt);
    } else {
      logger.info(`[CrabCallr] Idle max prompts reached for call ${state.callId}, ending`);
      ws.sendSpeak(state.callId, config.idle.endMessage, true);
      // Stop checking — the call will end
      if (state.idleCheckInterval) {
        clearInterval(state.idleCheckInterval);
        state.idleCheckInterval = null;
      }
    }
  }, IDLE_CHECK_INTERVAL_MS);
}

const FillerConfigSchema = Type.Object(
  {
    enabled: Type.Optional(Type.Boolean({ description: "Enable filler phrases during request processing", default: true })),
    phrases: Type.Optional(Type.Array(Type.String(), { description: "Filler phrases to speak while waiting" })),
    initialDelaySec: Type.Optional(Type.Number({ description: "Seconds before first filler", default: 3 })),
    intervalSec: Type.Optional(Type.Number({ description: "Seconds between subsequent fillers", default: 6 })),
    maxPerRequest: Type.Optional(Type.Number({ description: "Maximum fillers per request", default: 3 })),
  },
  { additionalProperties: false },
);

const IdleConfigSchema = Type.Object(
  {
    enabled: Type.Optional(Type.Boolean({ description: "Enable idle detection", default: true })),
    timeoutSec: Type.Optional(Type.Number({ description: "Seconds of silence before idle prompt", default: 60 })),
    prompt: Type.Optional(Type.String({ description: "Message to ask if user is still there" })),
    maxPrompts: Type.Optional(Type.Number({ description: "Maximum idle prompts before ending call", default: 2 })),
    endMessage: Type.Optional(Type.String({ description: "Goodbye message when ending due to idle" })),
  },
  { additionalProperties: false },
);

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
    fillers: Type.Optional(FillerConfigSchema),
    idle: Type.Optional(IdleConfigSchema),
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
  onComplete?: () => void;
  onError?: () => void;
}) {
  const { cfg, accountId, requestId, text, callId, ws, statusSink, logError, onComplete, onError } = params;
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
        onComplete?.();
      },
      onError: (err: unknown, info: { kind: "tool" | "block" | "final" }) => {
        logError(`[CrabCallr] ${info.kind} reply failed: ${String(err)}`);
        onError?.();
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
          fillers: account.config.fillers,
          idle: account.config.idle,
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
      const callStates = new Map<string, CallState>();
      connections.set(account.accountId, { accountId: account.accountId, ws, statusSink, callStates });

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
        // Clear all call states — stale state from previous connection
        clearAllCallStates(callStates);
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

        // Get or create call state (lazy init handles missed callStart on reconnect)
        let state = callStates.get(callId);
        if (!state) {
          state = createCallState(callId);
          callStates.set(callId, state);
          startIdleCheckInterval(state, config, ws, logger);
        }

        // Update activity and reset idle prompts
        state.lastActivityAt = Date.now();
        state.idlePromptCount = 0;

        // Clear any existing filler timer and start new one
        clearFillerTimer(state);
        state.currentRequestId = requestId;
        startFillerTimer(state, config, ws, logger);

        handleRequest({
          cfg: ctx.cfg,
          accountId: account.accountId,
          requestId,
          text,
          callId,
          ws,
          statusSink,
          logError: (message) => logger.error(message),
          onComplete: () => {
            // Clear filler timer and update activity on response
            const s = callStates.get(callId);
            if (s) {
              clearFillerTimer(s);
              s.lastActivityAt = Date.now();
            }
          },
          onError: () => {
            // Clear filler timer on error
            const s = callStates.get(callId);
            if (s) {
              clearFillerTimer(s);
            }
          },
        }).catch((err) => {
          logger.error(`[CrabCallr] Failed to handle request: ${String(err)}`);
          // Clear filler timer on unhandled error
          const s = callStates.get(callId);
          if (s) {
            clearFillerTimer(s);
          }
        });
      });

      ws.on("callStart", (callId, source) => {
        logger.info(`[CrabCallr] Call started from ${source}: ${callId}`);
        // Create call state and start idle detection
        const state = createCallState(callId);
        callStates.set(callId, state);
        startIdleCheckInterval(state, config, ws, logger);
      });

      ws.on("callEnd", (callId, durationSeconds, source) => {
        logger.info(
          `[CrabCallr] Call ended: ${callId} (${durationSeconds}s from ${source})`,
        );
        // Clean up call state
        const state = callStates.get(callId);
        if (state) {
          clearCallState(state);
          callStates.delete(callId);
        }
      });

      const stop = () => {
        clearAllCallStates(callStates);
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
