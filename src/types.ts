/**
 * CrabCallr Plugin Types
 *
 * Channel config and WebSocket message types for the CrabCallr voice plugin.
 */

// =============================================================================
// Configuration Types
// =============================================================================

export type FillerConfig = {
  enabled?: boolean;
  phrases?: string[];
  initialDelaySec?: number;
  intervalSec?: number;
  maxPerRequest?: number;
};

export type IdleConfig = {
  enabled?: boolean;
  timeoutSec?: number;
  prompt?: string;
  maxPrompts?: number;
  endMessage?: string;
};

export type CrabCallrAccountConfig = {
  name?: string;
  enabled?: boolean;
  apiKey?: string;
  serviceUrl?: string;
  autoConnect?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  requestTimeoutSec?: number;
  fillers?: FillerConfig;
  idle?: IdleConfig;
};

export type CrabCallrChannelConfig = CrabCallrAccountConfig & {
  accounts?: Record<string, CrabCallrAccountConfig>;
};

export type ResolvedFillerConfig = {
  enabled: boolean;
  phrases: string[];
  initialDelaySec: number;
  intervalSec: number;
  maxPerRequest: number;
};

export type ResolvedIdleConfig = {
  enabled: boolean;
  timeoutSec: number;
  prompt: string;
  maxPrompts: number;
  endMessage: string;
};

export type CrabCallrConfig = {
  apiKey: string;
  serviceUrl: string;
  autoConnect: boolean;
  reconnectInterval: number;
  maxReconnectAttempts: number;
  requestTimeoutSec: number;
  fillers: ResolvedFillerConfig;
  idle: ResolvedIdleConfig;
};

export type CrabCallrLogger = {
  debug?: (message: string) => void;
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
};

// =============================================================================
// WebSocket Message Types
// =============================================================================

export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "error";

export type CallSource = "browser" | "phone";

export enum MessageType {
  AUTH = "auth",
  AUTH_RESULT = "auth_result",
  USER_MESSAGE = "user_message",
  UTTERANCE = "utterance",
  PING = "ping",
  PONG = "pong",
  CALL_START = "call_start",
  CALL_END = "call_end",
  CALL_END_REQUEST = "call_end_request",
}

export interface BaseMessage {
  type: MessageType;
}

export interface AuthMessage {
  type: MessageType.AUTH;
  apiKey: string;
  ts: number;
}

export interface AuthResultMessage {
  type: MessageType.AUTH_RESULT;
  success: boolean;
  userId?: string;
  error?: string;
  ts: number;
}

export interface UserMessageMessage {
  type: MessageType.USER_MESSAGE;
  messageId: string;
  text: string;
  callId: string;
  ts: number;
}

export interface UtteranceMessage {
  type: MessageType.UTTERANCE;
  utteranceId: string;
  callId: string;
  text: string;
  endCall?: boolean;
  ts: number;
}

export interface PingMessage {
  type: MessageType.PING;
  ts: number;
}

export interface PongMessage {
  type: MessageType.PONG;
  ts: number;
}

export interface CallStartMessage {
  type: MessageType.CALL_START;
  callId: string;
  source: CallSource;
  ts: number;
}

export interface CallEndMessage {
  type: MessageType.CALL_END;
  callId: string;
  durationSeconds: number;
  source: CallSource;
  startedAt: number;
  ts: number;
}

export interface CallEndRequestMessage {
  type: MessageType.CALL_END_REQUEST;
  userId: string;
  callId: string;
  ts: number;
}

export type InboundWsMessage =
  | AuthResultMessage
  | UserMessageMessage
  | CallStartMessage
  | CallEndMessage
  | PingMessage
  | PongMessage;

export type OutboundWsMessage =
  | AuthMessage
  | UtteranceMessage
  | CallEndRequestMessage
  | PingMessage
  | PongMessage;

export interface CrabCallrEvents {
  connected: () => void;
  disconnected: (reason: string) => void;
  error: (error: Error) => void;
  userMessage: (messageId: string, text: string, callId: string) => void;
  callStart: (callId: string, source: CallSource) => void;
  callEnd: (callId: string, durationSeconds: number, source: CallSource, startedAt: number) => void;
}
