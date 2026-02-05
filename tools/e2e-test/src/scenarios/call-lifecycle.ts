/**
 * Scenario: Full call lifecycle — call_start → request → (optional response) → call_end
 */

import type { MockWsManager } from "../mock-ws-manager.js";
import type { TestContext, TestResult, TestScenario } from "../types.js";

export function createCallLifecycleScenario(mock: MockWsManager): TestScenario {
  return {
    name: "call-lifecycle",
    description: "Call start, request, and call end lifecycle",
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
        const requestId = "req-1";

        // Send call_start
        mock.sendCallStart(callId, "browser");

        // Small delay to let plugin process
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Send a request
        mock.clearReceivedMessages();
        mock.sendRequest(requestId, "Say hello", callId);

        if (ctx.mode === "live") {
          // In live mode, expect a response with matching requestId and non-empty text
          try {
            const response = await mock.waitForResponse(requestId, ctx.timeout);

            if (response.type !== "response") {
              return {
                name: "call-lifecycle",
                passed: false,
                skipped: false,
                duration: Date.now() - start,
                error: `Expected response message, got ${response.type}`,
              };
            }

            if (!("requestId" in response) || response.requestId !== requestId) {
              return {
                name: "call-lifecycle",
                passed: false,
                skipped: false,
                duration: Date.now() - start,
                error: `Response requestId mismatch: expected "${requestId}", got "${"requestId" in response ? response.requestId : "N/A"}"`,
              };
            }

            if (!("text" in response) || !response.text.trim()) {
              return {
                name: "call-lifecycle",
                passed: false,
                skipped: false,
                duration: Date.now() - start,
                error: "Response text is empty",
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
          // Protocol mode: wait up to 15s for a response. If none comes, that's
          // acceptable (no LLM configured). We just verify no crash/disconnect.
          try {
            const response = await mock.waitForResponse(requestId, 15_000);
            // If we got a response, validate structure
            if (response.type === "response" && "requestId" in response) {
              if (response.requestId !== requestId) {
                return {
                  name: "call-lifecycle",
                  passed: false,
                  skipped: false,
                  duration: Date.now() - start,
                  error: `Response requestId mismatch: expected "${requestId}", got "${response.requestId}"`,
                };
              }
            }
          } catch {
            // Timeout is acceptable in protocol mode — no LLM to generate response
          }
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
