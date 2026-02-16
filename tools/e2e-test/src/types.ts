/**
 * Types for the E2E test tool
 */

export type CallSource = "browser" | "phone";

// ---- Messages from plugin to manager (what the mock ws-manager receives) ----

export interface AuthMessage {
  type: "auth";
  apiKey: string;
  ts: number;
}

export interface UtteranceMessage {
  type: "utterance";
  utteranceId: string;
  callId: string;
  text: string;
  endCall?: boolean;
  ts: number;
}

export interface CallEndRequestMessage {
  type: "call_end_request";
  userId: string;
  callId: string;
  ts: number;
}

export interface PluginPingMessage {
  type: "ping";
  ts: number;
}

export type PluginToManagerMessage =
  | AuthMessage
  | UtteranceMessage
  | CallEndRequestMessage
  | PluginPingMessage;

// ---- Messages from manager to plugin (what the mock ws-manager sends) ----

export interface AuthResultMessage {
  type: "auth_result";
  success: boolean;
  userId?: string;
  error?: string;
  ts: number;
}

export interface UserMessageMessage {
  type: "user_message";
  messageId: string;
  text: string;
  callId: string;
  ts: number;
}

export interface CallStartMessage {
  type: "call_start";
  callId: string;
  source: CallSource;
  ts: number;
}

export interface CallEndMessage {
  type: "call_end";
  callId: string;
  durationSeconds: number;
  source: CallSource;
  startedAt: number;
  ts: number;
}

export interface PongMessage {
  type: "pong";
  ts: number;
}

export type ManagerToPluginMessage =
  | AuthResultMessage
  | UserMessageMessage
  | CallStartMessage
  | CallEndMessage
  | PongMessage;

// ---- Test infrastructure types ----

export type TestMode = "protocol" | "live";

export interface TestContext {
  mode: TestMode;
  verbose: boolean;
  timeout: number;
}

export interface TestResult {
  name: string;
  passed: boolean;
  skipped: boolean;
  duration: number;
  error?: string;
}

export interface TestScenario {
  name: string;
  description: string;
  /** If true, scenario only runs in live mode */
  liveOnly?: boolean;
  run: (ctx: TestContext) => Promise<TestResult>;
}

export interface CliOptions {
  openclawVersion: string;
  live: boolean;
  port: number;
  scenario: string | undefined;
  timeout: number;
  verbose: boolean;
  keepEnv: boolean;
  apiKeyEnv: string;
  model: string;
}
