/**
 * Export all test scenarios
 */

import type { MockWsManager } from "../mock-ws-manager.js";
import type { TestScenario } from "../types.js";
import { createAuthConnectScenario } from "./auth-connect.js";
import { createPingPongScenario } from "./ping-pong.js";
import { createWsHeartbeatScenario } from "./ws-heartbeat.js";
import { createCallLifecycleScenario } from "./call-lifecycle.js";
import { createMultiTurnScenario } from "./multi-turn.js";
import { createAgentEndCallScenario } from "./agent-end-call.js";
import { createProtocolSchemaScenario } from "./protocol-schema.js";

export function createAllScenarios(mock: MockWsManager): TestScenario[] {
  return [
    createAuthConnectScenario(mock),
    createPingPongScenario(mock),
    createWsHeartbeatScenario(mock),
    createCallLifecycleScenario(mock),
    createMultiTurnScenario(mock),
    createAgentEndCallScenario(mock),
    // Schema compliance must run last — it checks all accumulated violations
    createProtocolSchemaScenario(mock),
  ];
}
