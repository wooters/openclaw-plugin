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

        // Send a pong (simulating the server responding to a plugin ping).
        // The plugin sends pings on a 30s interval. Rather than wait 30s,
        // we verify the reverse: send a "pong" from mock (which the plugin
        // handles silently — it clears its ping timeout). This is a no-op
        // test unless we also check that the plugin sends its own pings.

        // Clear previously received messages so we only look at new ones
        mock.clearReceivedMessages();

        // Wait up to 35s for the plugin to send a ping (its interval is 30s)
        try {
          await mock.waitForMessage("ping", 35_000);
        } catch {
          return {
            name: "ping-pong",
            passed: false,
            skipped: false,
            duration: Date.now() - start,
            error: "Plugin did not send a ping within 35s",
          };
        }

        // Verify the mock ws-manager responded with a pong (handled automatically)
        // and that the connection is still alive
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
