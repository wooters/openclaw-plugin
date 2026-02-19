/**
 * Scenario: Full call lifecycle — call_start → user_message → (optional utterance) → call_end
 */

import type { MockWsManager } from "../mock-ws-manager.js";
import type { TestContext, TestResult, TestScenario } from "../types.js";

export function createCallLifecycleScenario(mock: MockWsManager): TestScenario {
  return {
    name: "call-lifecycle",
    description: "Call start, user message, and call end lifecycle",
    async run(ctx: TestContext): Promise<TestResult> {
      const start = Date.now();
      try {
        if (!mock.isConnected()) {
          return {
            name: "call-lifecycle",
            passed: false,
            skipped: false,
            duration: Date.now() - start,
            error: "Plugin not connected",
          };
        }

        const callId = "test-call-1";
        const messageId = "usr_001";

        // Send call_start
        mock.sendCallStart(callId, "browser");

        // Small delay to let plugin process
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Send a user message
        mock.clearReceivedMessages();
        mock.sendUserMessage(messageId, "Say hello", callId);

        if (ctx.mode === "live") {
          // In live mode, expect an utterance with non-empty text
          try {
            const utterance = await mock.waitForUtterance(ctx.timeout);

            if (utterance.type !== "utterance") {
              return {
                name: "call-lifecycle",
                passed: false,
                skipped: false,
                duration: Date.now() - start,
                error: `Expected utterance message, got ${utterance.type}`,
              };
            }

            if (!("utteranceId" in utterance) || !utterance.utteranceId.startsWith("oc_")) {
              return {
                name: "call-lifecycle",
                passed: false,
                skipped: false,
                duration: Date.now() - start,
                error: `Invalid utteranceId: expected "oc_*", got "${"utteranceId" in utterance ? utterance.utteranceId : "N/A"}"`,
              };
            }

            if (!("text" in utterance) || !utterance.text.trim()) {
              return {
                name: "call-lifecycle",
                passed: false,
                skipped: false,
                duration: Date.now() - start,
                error: "Utterance text is empty",
              };
            }
          } catch (err) {
            return {
              name: "call-lifecycle",
              passed: false,
              skipped: false,
              duration: Date.now() - start,
              error: `Live mode: ${String(err)}`,
            };
          }
        } else {
          // Protocol mode: wait up to 15s for an utterance. If none comes, that's
          // acceptable (no LLM configured). We just verify no crash/disconnect.
          try {
            const utterance = await mock.waitForUtterance(15_000);
            // If we got an utterance, validate structure
            if (utterance.type === "utterance" && "utteranceId" in utterance) {
              if (!utterance.utteranceId.startsWith("oc_")) {
                return {
                  name: "call-lifecycle",
                  passed: false,
                  skipped: false,
                  duration: Date.now() - start,
                  error: `Invalid utteranceId format: "${utterance.utteranceId}"`,
                };
              }
            }
          } catch {
            // Timeout is acceptable in protocol mode — no LLM to generate response
          }
        }

        // Send an oversized message and verify plugin stays connected.
        // The plugin should truncate this input safely instead of disconnecting.
        mock.sendUserMessage("usr_oversized", "x".repeat(4500), callId);
        await new Promise((resolve) => setTimeout(resolve, 500));
        if (!mock.isConnected()) {
          return {
            name: "call-lifecycle",
            passed: false,
            skipped: false,
            duration: Date.now() - start,
            error: "Plugin disconnected after oversized user_message",
          };
        }

        // Verify still connected
        if (!mock.isConnected()) {
          return {
            name: "call-lifecycle",
            passed: false,
            skipped: false,
            duration: Date.now() - start,
            error: "Plugin disconnected during call lifecycle",
          };
        }

        // Send call_end
        mock.sendCallEnd(callId, 10, "browser");

        // Small delay to let plugin process
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Verify still connected after call_end
        if (!mock.isConnected()) {
          return {
            name: "call-lifecycle",
            passed: false,
            skipped: false,
            duration: Date.now() - start,
            error: "Plugin disconnected after call_end",
          };
        }

        return {
          name: "call-lifecycle",
          passed: true,
          skipped: false,
          duration: Date.now() - start,
        };
      } catch (err) {
        return {
          name: "call-lifecycle",
          passed: false,
          skipped: false,
          duration: Date.now() - start,
          error: String(err),
        };
      }
    },
  };
}
