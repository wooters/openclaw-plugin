/**
 * Scenario: Plugin connects and authenticates with mock ws-manager
 */

import type { MockWsManager } from "../mock-ws-manager.js";
import type { TestContext, TestResult, TestScenario } from "../types.js";

export function createAuthConnectScenario(mock: MockWsManager): TestScenario {
  return {
    name: "auth-connect",
    description: "Plugin connects and authenticates",
    async run(_ctx: TestContext): Promise<TestResult> {
      const start = Date.now();
      try {
        // The plugin should already be connected by the time scenarios run.
        // Verify by checking received messages for an auth message.
        const messages = mock.getReceivedMessages();
        const authMsg = messages.find((m) => m.type === "auth");

        if (!authMsg) {
          return {
            name: "auth-connect",
            passed: false,
            skipped: false,
            duration: Date.now() - start,
            error: "No auth message received from plugin",
          };
        }

        if (authMsg.type !== "auth" || !authMsg.apiKey.startsWith("cc_")) {
          return {
            name: "auth-connect",
            passed: false,
            skipped: false,
            duration: Date.now() - start,
            error: `Invalid auth message: expected apiKey starting with "cc_", got "${authMsg.type === "auth" ? authMsg.apiKey : "N/A"}"`,
          };
        }

        // Verify connection is still alive
        if (!mock.isConnected()) {
          return {
            name: "auth-connect",
            passed: false,
            skipped: false,
            duration: Date.now() - start,
            error: "Plugin disconnected after authentication",
          };
        }

        // Wait a moment to ensure no unexpected disconnections
        await new Promise((resolve) => setTimeout(resolve, 2000));

        if (!mock.isConnected()) {
          return {
            name: "auth-connect",
            passed: false,
            skipped: false,
            duration: Date.now() - start,
            error: "Plugin disconnected within 2s after authentication",
          };
        }

        return {
          name: "auth-connect",
          passed: true,
          skipped: false,
          duration: Date.now() - start,
        };
      } catch (err) {
        return {
          name: "auth-connect",
          passed: false,
          skipped: false,
          duration: Date.now() - start,
          error: String(err),
        };
      }
    },
  };
}
