/**
 * CallClawd Plugin Types
 */

/**
 * Plugin configuration from clawdbot.json
 */
export interface CallClawdConfig {
  /** API key from app.callclawd.com */
  apiKey: string;
  /** WebSocket URL for CallClawd service */
  serviceUrl: string;
  /** Automatically connect on startup */
  autoConnect: boolean;
  /** Reconnection interval in ms */
  reconnectInterval: number;
  /** Max reconnect attempts (0 = unlimited) */
  maxReconnectAttempts: number;
}

/**
 * Connection status
 */
export type ConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';

/**
 * Message types from CallClawd service
 */
export enum MessageType {
  /** Authentication request */
  AUTH = 'auth',
  /** Authentication response */
  AUTH_RESPONSE = 'auth_response',
  /** Transcribed user speech */
  TRANSCRIPT = 'transcript',
  /** Response from ClawdBot */
  RESPONSE = 'response',
  /** Call started */
  CALL_START = 'call_start',
  /** Call ended */
  CALL_END = 'call_end',
  /** Heartbeat/ping */
  PING = 'ping',
  /** Heartbeat/pong */
  PONG = 'pong',
  /** Error message */
  ERROR = 'error',
}

/**
 * Base message structure
 */
export interface BaseMessage {
  type: MessageType;
  timestamp: number;
  requestId?: string;
}

/**
 * Authentication message sent to service
 */
export interface AuthMessage extends BaseMessage {
  type: MessageType.AUTH;
  apiKey: string;
  pluginVersion: string;
}

/**
 * Authentication response from service
 */
export interface AuthResponseMessage extends BaseMessage {
  type: MessageType.AUTH_RESPONSE;
  success: boolean;
  userId?: string;
  error?: string;
}

/**
 * Transcript of user speech from service
 */
export interface TranscriptMessage extends BaseMessage {
  type: MessageType.TRANSCRIPT;
  callId: string;
  text: string;
  isFinal: boolean;
  confidence?: number;
}

/**
 * Response to send back to service
 */
export interface ResponseMessage extends BaseMessage {
  type: MessageType.RESPONSE;
  callId: string;
  text: string;
  requestId: string;
}

/**
 * Call start notification
 */
export interface CallStartMessage extends BaseMessage {
  type: MessageType.CALL_START;
  callId: string;
  source: 'browser' | 'phone';
  callerInfo?: {
    phoneNumber?: string;
  };
}

/**
 * Call end notification
 */
export interface CallEndMessage extends BaseMessage {
  type: MessageType.CALL_END;
  callId: string;
  reason: 'user_hangup' | 'timeout' | 'error' | 'disconnect';
  duration?: number;
}

/**
 * Ping message for keepalive
 */
export interface PingMessage extends BaseMessage {
  type: MessageType.PING;
}

/**
 * Pong message for keepalive
 */
export interface PongMessage extends BaseMessage {
  type: MessageType.PONG;
}

/**
 * Error message
 */
export interface ErrorMessage extends BaseMessage {
  type: MessageType.ERROR;
  code: string;
  message: string;
  callId?: string;
}

/**
 * Union type for all inbound messages (from service)
 */
export type InboundMessage =
  | AuthResponseMessage
  | TranscriptMessage
  | CallStartMessage
  | CallEndMessage
  | PingMessage
  | ErrorMessage;

/**
 * Union type for all outbound messages (to service)
 */
export type OutboundMessage =
  | AuthMessage
  | ResponseMessage
  | PongMessage;

/**
 * Active call information
 */
export interface ActiveCall {
  callId: string;
  source: 'browser' | 'phone';
  startTime: number;
  callerInfo?: {
    phoneNumber?: string;
  };
}

/**
 * Event types emitted by the WebSocket manager
 */
export interface CallClawdEvents {
  connected: () => void;
  disconnected: (reason: string) => void;
  error: (error: Error) => void;
  callStart: (call: ActiveCall) => void;
  callEnd: (callId: string, reason: string, duration?: number) => void;
  transcript: (callId: string, text: string, isFinal: boolean) => void;
}

/**
 * ClawdBot Gateway interface (subset of what we need)
 */
export interface ClawdBotGateway {
  /** Send a message to the agent and get a response */
  sendMessage(message: string, context?: MessageContext): Promise<string>;
  /** Get plugin configuration */
  getPluginConfig<T>(pluginId: string): T | undefined;
  /** Log a message */
  log(level: 'debug' | 'info' | 'warn' | 'error', message: string, ...args: unknown[]): void;
}

/**
 * Context for message processing
 */
export interface MessageContext {
  /** Source of the message */
  source: 'callclawd';
  /** Call ID */
  callId: string;
  /** Whether this is a voice call */
  isVoice: boolean;
}

/**
 * Tool registration interface
 */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
    }>;
    required?: string[];
  };
  handler: (params: Record<string, unknown>) => Promise<unknown>;
}

/**
 * CLI command registration interface
 */
export interface CliCommand {
  name: string;
  description: string;
  handler: (args: string[]) => Promise<void>;
}
