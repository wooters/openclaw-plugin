/**
 * CallClawd Plugin for ClawdBot
 *
 * Enables voice calling via phone or browser through the CallClawd service.
 */

import type {
  CallClawdConfig,
  ClawdBotGateway,
  ActiveCall,
  ToolDefinition,
  CliCommand,
} from './types';
import { validateConfig, maskApiKey } from './config';
import { CallClawdWebSocket } from './websocket';

// Store for pending responses keyed by requestId
const pendingResponses = new Map<string, {
  resolve: (text: string) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}>();

// Response timeout in ms
const RESPONSE_TIMEOUT = 30000;

/**
 * Plugin state
 */
let wsManager: CallClawdWebSocket | null = null;
let gateway: ClawdBotGateway | null = null;
let config: CallClawdConfig | null = null;

/**
 * Logger wrapper that uses gateway logger if available
 */
function log(level: 'debug' | 'info' | 'warn' | 'error', message: string, ...args: unknown[]): void {
  if (gateway) {
    gateway.log(level, `[CallClawd] ${message}`, ...args);
  } else {
    const fn = level === 'error' ? console.error : console.log;
    fn(`[CallClawd] ${message}`, ...args);
  }
}

/**
 * Handle incoming transcript from CallClawd service
 */
async function handleTranscript(
  callId: string,
  text: string,
  isFinal: boolean,
  requestId?: string
): Promise<void> {
  // Only process final transcripts
  if (!isFinal) {
    log('debug', `Interim transcript: "${text}"`);
    return;
  }

  log('info', `Processing: "${text}"`);

  if (!gateway) {
    log('error', 'Gateway not available');
    return;
  }

  try {
    // Send to ClawdBot agent with voice context
    const response = await gateway.sendMessage(text, {
      source: 'callclawd',
      callId,
      isVoice: true,
    });

    log('info', `Response: "${response.slice(0, 100)}${response.length > 100 ? '...' : ''}"`);

    // Send response back to service
    if (wsManager && requestId) {
      wsManager.sendResponse(callId, response, requestId);
    }
  } catch (error) {
    log('error', 'Failed to get response from agent', error);

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
  log('info', `Starting ${sourceText}`);
}

/**
 * Handle call end
 */
function handleCallEnd(callId: string, reason: string, duration?: number): void {
  const durationText = duration ? ` (${Math.round(duration / 1000)}s)` : '';
  log('info', `Call ended: ${reason}${durationText}`);
}

/**
 * Get status tool definition
 */
function getStatusTool(): ToolDefinition {
  return {
    name: 'callclawd_status',
    description: 'Get the current status of the CallClawd voice connection',
    parameters: {
      type: 'object',
      properties: {},
    },
    handler: async () => {
      if (!wsManager) {
        return { connected: false, status: 'not_initialized' };
      }

      const status = wsManager.getStatus();
      const activeCalls = wsManager.getActiveCalls();

      return {
        connected: wsManager.isConnected(),
        status,
        userId: wsManager.getUserId(),
        activeCalls: activeCalls.map(call => ({
          callId: call.callId,
          source: call.source,
          duration: Date.now() - call.startTime,
        })),
      };
    },
  };
}

/**
 * Get CLI commands
 */
function getCliCommands(): CliCommand[] {
  return [
    {
      name: 'status',
      description: 'Show CallClawd connection status',
      handler: async () => {
        if (!wsManager) {
          console.log('CallClawd: Not initialized');
          return;
        }

        const status = wsManager.getStatus();
        const userId = wsManager.getUserId();
        const activeCalls = wsManager.getActiveCalls();

        console.log(`CallClawd Status: ${status}`);
        if (userId) {
          console.log(`User ID: ${userId}`);
        }
        if (config) {
          console.log(`Service: ${config.serviceUrl}`);
          console.log(`API Key: ${maskApiKey(config.apiKey)}`);
        }
        if (activeCalls.length > 0) {
          console.log(`Active calls: ${activeCalls.length}`);
          activeCalls.forEach(call => {
            const duration = Math.round((Date.now() - call.startTime) / 1000);
            console.log(`  - ${call.callId} (${call.source}, ${duration}s)`);
          });
        }
      },
    },
    {
      name: 'connect',
      description: 'Manually connect to CallClawd service',
      handler: async () => {
        if (!wsManager) {
          console.log('CallClawd: Not initialized');
          return;
        }
        if (wsManager.isConnected()) {
          console.log('CallClawd: Already connected');
          return;
        }
        console.log('CallClawd: Connecting...');
        wsManager.connect();
      },
    },
    {
      name: 'disconnect',
      description: 'Disconnect from CallClawd service',
      handler: async () => {
        if (!wsManager) {
          console.log('CallClawd: Not initialized');
          return;
        }
        if (!wsManager.isConnected()) {
          console.log('CallClawd: Not connected');
          return;
        }
        console.log('CallClawd: Disconnecting...');
        wsManager.disconnect();
      },
    },
  ];
}

/**
 * Plugin activation function
 * Called by ClawdBot when the plugin is loaded
 */
export async function activate(gw: ClawdBotGateway): Promise<{
  tools: ToolDefinition[];
  commands: CliCommand[];
}> {
  gateway = gw;
  log('info', 'Activating CallClawd plugin');

  // Get and validate configuration
  const rawConfig = gateway.getPluginConfig<Partial<CallClawdConfig>>('callclawd');
  if (!rawConfig) {
    throw new Error('CallClawd plugin configuration not found');
  }

  try {
    config = validateConfig(rawConfig);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Configuration validation failed';
    throw new Error(`CallClawd configuration error: ${message}`);
  }

  log('info', `Configured with service: ${config.serviceUrl}`);
  log('debug', `API key: ${maskApiKey(config.apiKey)}`);

  // Create WebSocket manager
  wsManager = new CallClawdWebSocket(config, log);

  // Set up event handlers
  wsManager.on('connected', () => {
    log('info', 'Connected to CallClawd service');
  });

  wsManager.on('disconnected', (reason) => {
    log('info', `Disconnected from CallClawd service: ${reason}`);
  });

  wsManager.on('error', (error) => {
    log('error', `CallClawd error: ${error.message}`);
  });

  wsManager.on('callStart', handleCallStart);
  wsManager.on('callEnd', handleCallEnd);

  wsManager.on('transcript', (callId, text, isFinal) => {
    // Note: requestId would come from the original transcript message
    // For now, we generate one based on timestamp
    const requestId = `req_${Date.now()}`;
    handleTranscript(callId, text, isFinal, requestId).catch(err => {
      log('error', 'Failed to handle transcript', err);
    });
  });

  // Connect if auto-connect is enabled
  if (config.autoConnect) {
    log('info', 'Auto-connecting to CallClawd service');
    wsManager.connect();
  }

  return {
    tools: [getStatusTool()],
    commands: getCliCommands(),
  };
}

/**
 * Plugin deactivation function
 * Called by ClawdBot when the plugin is unloaded
 */
export async function deactivate(): Promise<void> {
  log('info', 'Deactivating CallClawd plugin');

  // Clean up pending responses
  for (const [requestId, pending] of pendingResponses) {
    clearTimeout(pending.timeout);
    pending.reject(new Error('Plugin deactivated'));
    pendingResponses.delete(requestId);
  }

  // Disconnect WebSocket
  if (wsManager) {
    wsManager.disconnect();
    wsManager = null;
  }

  gateway = null;
  config = null;
}

// Export types for consumers
export type { CallClawdConfig, ActiveCall, ConnectionStatus } from './types';
