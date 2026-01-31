/**
 * CrabCallr Plugin for OpenClaw
 *
 * Enables voice calling via phone or browser through the CrabCallr service.
 * Implements the OpenClaw channel plugin API.
 */

import { Type } from '@sinclair/typebox';
import type {
  PluginAPI,
  CrabCallrConfig,
  ActiveCall,
  ChannelPlugin,
  OpenClawConfig,
  ChannelAccountConfig,
} from './types';
import { validateConfig, maskApiKey } from './config';
import { CrabCallrWebSocket } from './websocket';

// Plugin version
const PLUGIN_VERSION = '0.1.0';

// =============================================================================
// Plugin State
// =============================================================================

let wsManager: CrabCallrWebSocket | null = null;
let pluginApi: PluginAPI | null = null;
let config: CrabCallrConfig | null = null;

// Map call IDs to conversation IDs for the channel plugin
const callToConversation = new Map<string, string>();

// =============================================================================
// Channel Plugin Definition
// =============================================================================

const channelPlugin: ChannelPlugin = {
  id: 'crabcallr',
  meta: {
    id: 'crabcallr',
    label: 'CrabCallr Voice',
    selectionLabel: 'CrabCallr (Voice)',
    docsPath: '/channels/crabcallr',
    blurb: 'Voice calling via phone or browser',
    aliases: ['voice', 'phone'],
  },
  capabilities: {
    chatTypes: ['direct'],
  },
  config: {
    listAccountIds: (cfg: OpenClawConfig) =>
      Object.keys(cfg.channels?.crabcallr?.accounts ?? {}),
    resolveAccount: (cfg: OpenClawConfig, accountId?: string): ChannelAccountConfig | undefined =>
      cfg.channels?.crabcallr?.accounts?.[accountId ?? 'default'],
  },
  outbound: {
    deliveryMode: 'direct',
    sendText: async ({ text, conversationId }) => {
      // Find the call ID for this conversation
      let callId: string | undefined;
      for (const [cid, convId] of callToConversation) {
        if (convId === conversationId) {
          callId = cid;
          break;
        }
      }

      if (!callId) {
        return { ok: false, error: 'No active call for conversation' };
      }

      if (!wsManager || !wsManager.isConnected()) {
        return { ok: false, error: 'Not connected to CrabCallr service' };
      }

      // Generate a request ID for this response
      const requestId = `resp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      wsManager.sendResponse(callId, text, requestId);
      return { ok: true };
    },
  },
};

// =============================================================================
// Event Handlers
// =============================================================================

/**
 * Handle incoming transcript from CrabCallr service
 */
async function handleTranscript(
  callId: string,
  text: string,
  isFinal: boolean,
  requestId?: string
): Promise<void> {
  // Only process final transcripts
  if (!isFinal) {
    pluginApi?.logger.debug(`[CrabCallr] Interim transcript: "${text}"`);
    return;
  }

  if (!pluginApi) {
    console.error('[CrabCallr] Plugin API not available');
    return;
  }

  pluginApi.logger.info(`[CrabCallr] Processing: "${text}"`);

  try {
    // Get or create conversation ID for this call
    let conversationId = callToConversation.get(callId);
    if (!conversationId) {
      conversationId = `crabcallr_${callId}`;
      callToConversation.set(callId, conversationId);
    }

    // Send to OpenClaw via channel inbound API
    const result = await pluginApi.inbound.receiveMessage({
      accountId: 'default',
      conversationId,
      messageId: requestId ?? `msg_${Date.now()}`,
      text,
      sender: {
        id: callId,
        displayName: 'Voice Caller',
      },
      metadata: {
        source: 'crabcallr',
        callId,
        isVoice: true,
      },
    });

    if (!result.ok) {
      pluginApi.logger.error(`[CrabCallr] Failed to process message: ${result.error}`);

      // Send error response back to caller
      if (wsManager && requestId) {
        wsManager.sendResponse(
          callId,
          "I'm sorry, I encountered an error processing your request.",
          requestId
        );
      }
    }
  } catch (error) {
    pluginApi?.logger.error('[CrabCallr] Failed to handle transcript', error);

    // Send error response
    if (wsManager && requestId) {
      wsManager.sendResponse(
        callId,
        "I'm sorry, I encountered an error processing your request.",
        requestId
      );
    }
  }
}

/**
 * Handle call start
 */
function handleCallStart(call: ActiveCall): void {
  const sourceText = call.source === 'phone'
    ? `phone call${call.callerInfo?.phoneNumber ? ` from ${call.callerInfo.phoneNumber}` : ''}`
    : 'browser call';
  pluginApi?.logger.info(`[CrabCallr] Starting ${sourceText}`);

  // Create conversation mapping for this call
  const conversationId = `crabcallr_${call.callId}`;
  callToConversation.set(call.callId, conversationId);
}

/**
 * Handle call end
 */
function handleCallEnd(callId: string, reason: string, duration?: number): void {
  const durationText = duration ? ` (${Math.round(duration / 1000)}s)` : '';
  pluginApi?.logger.info(`[CrabCallr] Call ended: ${reason}${durationText}`);

  // Clean up conversation mapping
  callToConversation.delete(callId);
}

// =============================================================================
// Service Lifecycle
// =============================================================================

async function startService(): Promise<void> {
  if (!pluginApi) {
    throw new Error('Plugin API not initialized');
  }

  const logger = pluginApi.logger;
  logger.info('[CrabCallr] Starting service');

  // Get configuration from channel accounts
  // For now, we support a single 'default' account
  const rawConfig = pluginApi.config.get<ChannelAccountConfig>('channels.crabcallr.accounts.default');

  if (!rawConfig?.apiKey) {
    throw new Error('CrabCallr API key not configured. Set channels.crabcallr.accounts.default.apiKey');
  }

  try {
    config = validateConfig({
      apiKey: rawConfig.apiKey,
      serviceUrl: rawConfig.serviceUrl,
      autoConnect: rawConfig.autoConnect,
      reconnectInterval: rawConfig.reconnectInterval,
      maxReconnectAttempts: rawConfig.maxReconnectAttempts,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Configuration validation failed';
    throw new Error(`CrabCallr configuration error: ${message}`);
  }

  logger.info(`[CrabCallr] Configured with service: ${config.serviceUrl}`);
  logger.debug(`[CrabCallr] API key: ${maskApiKey(config.apiKey)}`);

  // Create WebSocket manager with plugin logger
  wsManager = new CrabCallrWebSocket(config, logger);

  // Set up event handlers
  wsManager.on('connected', () => {
    logger.info('[CrabCallr] Connected to CrabCallr service');
  });

  wsManager.on('disconnected', (reason) => {
    logger.info(`[CrabCallr] Disconnected from CrabCallr service: ${reason}`);
  });

  wsManager.on('error', (error) => {
    logger.error(`[CrabCallr] Error: ${error.message}`);
  });

  wsManager.on('callStart', handleCallStart);
  wsManager.on('callEnd', handleCallEnd);

  wsManager.on('transcript', (callId, text, isFinal, requestId) => {
    handleTranscript(callId, text, isFinal, requestId).catch(err => {
      logger.error('[CrabCallr] Failed to handle transcript', err);
    });
  });

  // Connect if auto-connect is enabled
  if (config.autoConnect) {
    logger.info('[CrabCallr] Auto-connecting to CrabCallr service');
    wsManager.connect();
  }
}

async function stopService(): Promise<void> {
  pluginApi?.logger.info('[CrabCallr] Stopping service');

  // Disconnect WebSocket
  if (wsManager) {
    wsManager.disconnect();
    wsManager = null;
  }

  // Clear conversation mappings
  callToConversation.clear();

  config = null;
}

// =============================================================================
// Status Helpers
// =============================================================================

function getStatus(): {
  connected: boolean;
  status: string;
  userId: string | null;
  activeCalls: Array<{ callId: string; source: string; duration: number }>;
} {
  if (!wsManager) {
    return {
      connected: false,
      status: 'not_initialized',
      userId: null,
      activeCalls: [],
    };
  }

  const activeCalls = wsManager.getActiveCalls();

  return {
    connected: wsManager.isConnected(),
    status: wsManager.getStatus(),
    userId: wsManager.getUserId(),
    activeCalls: activeCalls.map(call => ({
      callId: call.callId,
      source: call.source,
      duration: Date.now() - call.startTime,
    })),
  };
}

// =============================================================================
// Plugin Entry Point
// =============================================================================

export default function register(api: PluginAPI): void {
  pluginApi = api;
  const logger = api.logger;

  logger.info(`[CrabCallr] Registering plugin v${PLUGIN_VERSION}`);

  // Register as a channel plugin
  api.registerChannel({ plugin: channelPlugin });

  // Register service for WebSocket lifecycle
  api.registerService({
    id: 'crabcallr',
    start: startService,
    stop: stopService,
  });

  // Register status tool for agent use
  api.registerTool({
    name: 'crabcallr_status',
    description: 'Get the current status of the CrabCallr voice connection',
    parameters: Type.Object({}),
    execute: async (_toolUseId, _params) => {
      const status = getStatus();
      return {
        content: [{ type: 'text', text: JSON.stringify(status, null, 2) }],
      };
    },
  });

  // Register CLI commands
  api.registerCli(
    ({ program }) => {
      program
        .command('crabcallr:status')
        .description('Show CrabCallr connection status')
        .action(() => {
          const status = getStatus();
          console.log(`CrabCallr Status: ${status.status}`);
          console.log(`Connected: ${status.connected}`);
          if (status.userId) {
            console.log(`User ID: ${status.userId}`);
          }
          if (config) {
            console.log(`Service: ${config.serviceUrl}`);
            console.log(`API Key: ${maskApiKey(config.apiKey)}`);
          }
          if (status.activeCalls.length > 0) {
            console.log(`Active calls: ${status.activeCalls.length}`);
            status.activeCalls.forEach(call => {
              const duration = Math.round(call.duration / 1000);
              console.log(`  - ${call.callId} (${call.source}, ${duration}s)`);
            });
          }
        });

      program
        .command('crabcallr:connect')
        .description('Manually connect to CrabCallr service')
        .action(() => {
          if (!wsManager) {
            console.log('CrabCallr: Not initialized');
            return;
          }
          if (wsManager.isConnected()) {
            console.log('CrabCallr: Already connected');
            return;
          }
          console.log('CrabCallr: Connecting...');
          wsManager.connect();
        });

      program
        .command('crabcallr:disconnect')
        .description('Disconnect from CrabCallr service')
        .action(() => {
          if (!wsManager) {
            console.log('CrabCallr: Not initialized');
            return;
          }
          if (!wsManager.isConnected()) {
            console.log('CrabCallr: Not connected');
            return;
          }
          console.log('CrabCallr: Disconnecting...');
          wsManager.disconnect();
        });
    },
    { commands: ['crabcallr:status', 'crabcallr:connect', 'crabcallr:disconnect'] }
  );

  // Register gateway RPC methods
  api.registerGatewayMethod('crabcallr.status', ({ respond }) => {
    respond(getStatus());
  });

  api.registerGatewayMethod('crabcallr.speak', ({ respond, params }) => {
    const { callId, text } = params as { callId?: string; text?: string };

    if (!callId || !text) {
      respond({ ok: false, error: 'Missing callId or text parameter' });
      return;
    }

    if (!wsManager || !wsManager.isConnected()) {
      respond({ ok: false, error: 'Not connected to CrabCallr service' });
      return;
    }

    const requestId = `rpc_${Date.now()}`;
    wsManager.sendResponse(callId, text, requestId);
    respond({ ok: true, requestId });
  });

  logger.info('[CrabCallr] Plugin registered successfully');
}

// Export types for consumers
export type { CrabCallrConfig, ActiveCall, ConnectionStatus } from './types';
