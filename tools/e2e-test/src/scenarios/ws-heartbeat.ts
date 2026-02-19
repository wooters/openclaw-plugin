/**
 * Scenario: WebSocket control-frame heartbeat parity with production ws-manager
 */

import type { MockWsManager } from "../mock-ws-manager.js";
import type { TestContext, TestResult, TestScenario } from "../types.js";

export function createWsHeartbeatScenario(mock: MockWsManager): TestScenario {
  return {
    name: "ws-heartbeat",
    description: "WebSocket control-frame ping/pong heartbeat",
    async run(_ctx: TestContext): Promise<TestResult> {
      const start = Date.now();
      try {
        if (!mock.isConnected()) {
          return {
            name: "ws-heartbeat",
            passed: false,
            skipped: false,
            duration: Date.now() - start,
            error: "Plugin not connected",
          };
        }

        // Production ws-manager sends WebSocket ping control frames.
        const pongPromise = mock.waitForWsPong(2_000);
        mock.sendWsPing();

        try {
          await pongPromise;
        } catch {
          return {
            name: "ws-heartbeat",
            passed: false,
            skipped: false,
            duration: Date.now() - start,
            error: "Plugin did not respond to WebSocket ping with pong within 2s",
          };
        }

        if (!mock.isConnected()) {
          return {
            name: "ws-heartbeat",
            passed: false,
            skipped: false,
            duration: Date.now() - start,
            error: "Plugin disconnected after WebSocket heartbeat exchange",
          };
        }

        return {
          name: "ws-heartbeat",
          passed: true,
          skipped: false,
          duration: Date.now() - start,
        };
      } catch (err) {
        return {
          name: "ws-heartbeat",
          passed: false,
          skipped: false,
          duration: Date.now() - start,
          error: String(err),
        };
      }
    },
  };
}
