/**
 * Types for the E2E test tool
 */

export type CallSource = "browser" | "phone";

// ---- Messages from plugin to manager (what the mock ws-manager receives) ----

export interface AuthMessage {
  type: "auth";
  apiKey: string;
}

export interface ResponseMessage {
  type: "response";
  requestId: string;
  text: string;
}

export interface CallEndRequestMessage {
  type: "call_end_request";
  userId: string;
  callId: string;
}

export interface FillerMessage {
  type: "filler";
  requestId: string;
  text: string;
}

export interface SpeakMessage {
  type: "speak";
  userId: string;
  callId: string;
  text: string;
  endCall?: boolean;
}

export interface PluginPingMessage {
  type: "ping";
}

export type PluginToManagerMessage =
  | AuthMessage
  | ResponseMessage
  | CallEndRequestMessage
  | FillerMessage
  | SpeakMessage
  | PluginPingMessage;

// ---- Messages from manager to plugin (what the mock ws-manager sends) ----

export interface AuthResultMessage {
  type: "auth_result";
  success: boolean;
  userId?: string;
  error?: string;
}

export interface RequestMessage {
  type: "request";
  requestId: string;
  text: string;
  callId: string;
}

export interface CallStartMessage {
  type: "call_start";
  callId: string;
  source: CallSource;
}

export interface CallEndMessage {
  type: "call_end";
  callId: string;
  durationSeconds: number;
  source: CallSource;
  startedAt: number;
}

export interface PongMessage {
  type: "pong";
}

export interface ErrorMessage {
  type: "error";
  code: string;
  message: string;
}

export type ManagerToPluginMessage =
  | AuthResultMessage
  | RequestMessage
  | CallStartMessage
  | CallEndMessage
  | PongMessage
  | ErrorMessage;

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
