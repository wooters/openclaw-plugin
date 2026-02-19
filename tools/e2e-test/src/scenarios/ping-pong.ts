/**
 * Scenario: Keepalive ping/pong handshake
 */

import type { MockWsManager } from "../mock-ws-manager.js";
import type { TestContext, TestResult, TestScenario } from "../types.js";

export function createPingPongScenario(mock: MockWsManager): TestScenario {
  return {
    name: "ping-pong",
    description: "Keepalive ping/pong handshake",
    async run(_ctx: TestContext): Promise<TestResult> {
      const start = Date.now();
      try {
        if (!mock.isConnected()) {
          return {
            name: "ping-pong",
            passed: false,
            skipped: false,
            duration: Date.now() - start,
            error: "Plugin not connected",
          };
        }

        // Send a ping from the mock and verify the plugin responds with a pong.
        // This tests the keepalive mechanism without waiting 30s for the plugin's
        // own ping timer to fire.
        mock.clearReceivedMessages();
        mock.sendPing();

        try {
          await mock.waitForMessage("pong", 2_000);
        } catch {
          return {
            name: "ping-pong",
            passed: false,
            skipped: false,
            duration: Date.now() - start,
            error: "Plugin did not respond with pong within 2s",
          };
        }

        // Verify the connection is still alive
        if (!mock.isConnected()) {
          return {
            name: "ping-pong",
            passed: false,
            skipped: false,
            duration: Date.now() - start,
            error: "Plugin disconnected after ping/pong exchange",
          };
        }

        return {
          name: "ping-pong",
          passed: true,
          skipped: false,
          duration: Date.now() - start,
        };
      } catch (err) {
        return {
          name: "ping-pong",
          passed: false,
          skipped: false,
          duration: Date.now() - start,
          error: String(err),
        };
      }
    },
  };
}
