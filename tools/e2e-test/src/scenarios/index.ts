/**
 * Export all test scenarios
 */

import type { MockWsManager } from "../mock-ws-manager.js";
import type { TestScenario } from "../types.js";
import { createAuthConnectScenario } from "./auth-connect.js";
import { createPingPongScenario } from "./ping-pong.js";
import { createCallLifecycleScenario } from "./call-lifecycle.js";
import { createMultiTurnScenario } from "./multi-turn.js";

export function createAllScenarios(mock: MockWsManager): TestScenario[] {
  return [
    createAuthConnectScenario(mock),
    createPingPongScenario(mock),
    createCallLifecycleScenario(mock),
    createMultiTurnScenario(mock),
  ];
}
