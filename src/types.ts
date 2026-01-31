/**
 * CrabCallr Plugin Types
 *
 * Types for OpenClaw channel plugin API and CrabCallr-specific interfaces.
 */

import type { Command } from 'commander';
import type { TObject } from '@sinclair/typebox';

// =============================================================================
// OpenClaw Plugin API Types
// =============================================================================

/**
 * Logger interface provided by OpenClaw
 */
export interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

/**
 * Plugin configuration accessor
 */
export interface PluginConfig {
  get<T>(key: string): T | undefined;
  getRequired<T>(key: string): T;
}

/**
 * Service definition for plugin lifecycle
 */
export interface ServiceDefinition {
  id: string;
  start: () => Promise<void>;
  stop: () => Promise<void>;
}

/**
 * Tool content block
 */
export interface ToolContentBlock {
  type: 'text';
  text: string;
}

/**
 * Tool result
 */
export interface ToolResult {
  content: ToolContentBlock[];
}

/**
 * Tool definition for agent tools
 */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: TObject;
  execute: (toolUseId: string, params: Record<string, unknown>) => Promise<ToolResult>;
}

/**
 * CLI setup function type
 */
export type CliSetup = (context: { program: Command }) => void;

/**
 * RPC handler context
 */
export interface RpcContext {
  respond: (result: unknown) => void;
  params: Record<string, unknown>;
}

/**
 * RPC handler type
 */
export type RpcHandler = (context: RpcContext) => void | Promise<void>;

/**
 * Command definition for slash commands
 */
export interface CommandDefinition {
  name: string;
  description: string;
  execute: () => Promise<void>;
}

/**
 * Inbound message for channel plugins
 */
export interface InboundMessagePayload {
  accountId: string;
  conversationId: string;
  messageId: string;
  text: string;
  sender: {
    id: string;
    displayName?: string;
  };
  metadata?: Record<string, unknown>;
}

/**
 * Inbound message handler response
 */
export interface InboundMessageResult {
  ok: boolean;
  error?: string;
}

/**
 * Outbound send context
 */
export interface OutboundSendContext {
  text: string;
  conversationId: string;
  accountId: string;
  metadata?: Record<string, unknown>;
}

/**
 * Outbound send result
 */
export interface OutboundSendResult {
  ok: boolean;
  error?: string;
}

/**
 * Channel plugin capabilities
 */
export interface ChannelCapabilities {
  chatTypes: ('direct' | 'group')[];
}

/**
 * Channel plugin metadata
 */
export interface ChannelMeta {
  id: string;
  label: string;
  selectionLabel: string;
  docsPath: string;
  blurb: string;
  aliases: string[];
}

/**
 * Channel account configuration
 */
export interface ChannelAccountConfig {
  apiKey: string;
  serviceUrl?: string;
  autoConnect?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

/**
 * OpenClaw configuration structure
 */
export interface OpenClawConfig {
  channels?: {
    crabcallr?: {
      accounts?: Record<string, ChannelAccountConfig>;
    };
  };
}

/**
 * Channel plugin configuration helpers
 */
export interface ChannelConfig {
  listAccountIds: (cfg: OpenClawConfig) => string[];
  resolveAccount: (cfg: OpenClawConfig, accountId?: string) => ChannelAccountConfig | undefined;
}

/**
 * Channel plugin outbound handlers
 */
export interface ChannelOutbound {
  deliveryMode: 'direct' | 'queued';
  sendText: (context: OutboundSendContext) => Promise<OutboundSendResult>;
}

/**
 * Channel plugin definition
 */
export interface ChannelPlugin {
  id: string;
  meta: ChannelMeta;
  capabilities: ChannelCapabilities;
  config: ChannelConfig;
  outbound: ChannelOutbound;
}

/**
 * Inbound API for receiving messages
 */
export interface InboundAPI {
  receiveMessage: (payload: InboundMessagePayload) => Promise<InboundMessageResult>;
}

/**
 * Main plugin API provided by OpenClaw
 */
export interface PluginAPI {
  registerService(service: ServiceDefinition): void;
  registerTool(tool: ToolDefinition): void;
  registerCli(setup: CliSetup, options: { commands: string[] }): void;
  registerGatewayMethod(name: string, handler: RpcHandler): void;
  registerCommand(command: CommandDefinition): void;
  registerChannel(options: { plugin: ChannelPlugin }): void;
  inbound: InboundAPI;
  logger: Logger;
  config: PluginConfig;
}

// =============================================================================
// CrabCallr Plugin Configuration
// =============================================================================

/**
 * Plugin configuration from openclaw.json
 */
export interface CrabCallrConfig {
  /** API key from app.crabcallr.com */
  apiKey: string;
  /** WebSocket URL for CrabCallr service */
  serviceUrl: string;
  /** Automatically connect on startup */
  autoConnect: boolean;
  /** Reconnection interval in ms */
  reconnectInterval: number;
  /** Max reconnect attempts (0 = unlimited) */
  maxReconnectAttempts: number;
}

// =============================================================================
// WebSocket Message Types
// =============================================================================

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
 * Message types from CrabCallr service
 */
export enum MessageType {
  /** Authentication request */
  AUTH = 'auth',
  /** Authentication response */
  AUTH_RESPONSE = 'auth_response',
  /** Transcribed user speech */
  TRANSCRIPT = 'transcript',
  /** Response from OpenClaw */
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
export type InboundWsMessage =
  | AuthResponseMessage
  | TranscriptMessage
  | CallStartMessage
  | CallEndMessage
  | PingMessage
  | ErrorMessage;

/**
 * Union type for all outbound messages (to service)
 */
export type OutboundWsMessage =
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
export interface CrabCallrEvents {
  connected: () => void;
  disconnected: (reason: string) => void;
  error: (error: Error) => void;
  callStart: (call: ActiveCall) => void;
  callEnd: (callId: string, reason: string, duration?: number) => void;
  transcript: (callId: string, text: string, isFinal: boolean, requestId?: string) => void;
}
