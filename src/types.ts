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
  REQUEST = "request",
  RESPONSE = "response",
  PING = "ping",
  PONG = "pong",
  ERROR = "error",
  CALL_START = "call_start",
  CALL_END = "call_end",
  CALL_END_REQUEST = "call_end_request",
  FILLER = "filler",
  SPEAK = "speak",
}

export interface BaseMessage {
  type: MessageType;
}

export interface AuthMessage {
  type: MessageType.AUTH;
  apiKey: string;
}

export interface AuthResultMessage {
  type: MessageType.AUTH_RESULT;
  success: boolean;
  userId?: string;
  error?: string;
}

export interface RequestMessage {
  type: MessageType.REQUEST;
  requestId: string;
  text: string;
  callId: string;
}

export interface ResponseMessage {
  type: MessageType.RESPONSE;
  requestId: string;
  text: string;
}

export interface PingMessage {
  type: MessageType.PING;
}

export interface PongMessage {
  type: MessageType.PONG;
}

export interface ErrorMessage {
  type: MessageType.ERROR;
  code: string;
  message: string;
}

export interface CallStartMessage {
  type: MessageType.CALL_START;
  callId: string;
  source: CallSource;
}

export interface CallEndMessage {
  type: MessageType.CALL_END;
  callId: string;
  durationSeconds: number;
  source: CallSource;
  startedAt: number;
}

export interface CallEndRequestMessage {
  type: MessageType.CALL_END_REQUEST;
  userId: string;
  callId: string;
}

export interface FillerMessage {
  type: MessageType.FILLER;
  requestId: string;
  text: string;
}

export interface SpeakMessage {
  type: MessageType.SPEAK;
  userId: string;
  callId: string;
  text: string;
  endCall?: boolean;
}

export type InboundWsMessage =
  | AuthResultMessage
  | RequestMessage
  | CallStartMessage
  | CallEndMessage
  | PingMessage
  | PongMessage
  | ErrorMessage;

export type OutboundWsMessage =
  | AuthMessage
  | ResponseMessage
  | CallEndRequestMessage
  | FillerMessage
  | SpeakMessage
  | PingMessage
  | PongMessage;

export interface CrabCallrEvents {
  connected: () => void;
  disconnected: (reason: string) => void;
  error: (error: Error) => void;
  request: (requestId: string, text: string, callId: string) => void;
  callStart: (callId: string, source: CallSource) => void;
  callEnd: (callId: string, durationSeconds: number, source: CallSource, startedAt: number) => void;
}
