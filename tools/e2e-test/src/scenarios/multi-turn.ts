/**
 * Scenario: Multiple requests in a single call (live mode only)
 */

import type { MockWsManager } from "../mock-ws-manager.js";
import type { TestContext, TestResult, TestScenario } from "../types.js";

const PROMPTS = [
  { id: "mt-req-1", text: "What is 2 plus 2?" },
  { id: "mt-req-2", text: "Now multiply that by 3" },
  { id: "mt-req-3", text: "Thanks, goodbye" },
];

export function createMultiTurnScenario(mock: MockWsManager): TestScenario {
  return {
    name: "multi-turn",
    description: "Multiple requests in a single call (live mode only)",
    liveOnly: true,
    async run(ctx: TestContext): Promise<TestResult> {
      const start = Date.now();
      try {
        if (!mock.isConnected()) {
          return {
            name: "multi-turn",
            passed: false,
            skipped: false,
            duration: Date.now() - start,
            error: "Plugin not connected",
          };
        }

        const callId = "test-call-multi";

        // Send call_start
        mock.sendCallStart(callId, "browser");
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Send each request and wait for response
        for (const prompt of PROMPTS) {
          mock.clearReceivedMessages();
          mock.sendRequest(prompt.id, prompt.text, callId);

          let response;
          try {
            response = await mock.waitForResponse(prompt.id, ctx.timeout);
          } catch (err) {
            return {
              name: "multi-turn",
              passed: false,
              skipped: false,
              duration: Date.now() - start,
              error: `No response for "${prompt.text}": ${String(err)}`,
            };
          }

          if (response.type !== "response" || !("requestId" in response)) {
            return {
              name: "multi-turn",
              passed: false,
              skipped: false,
              duration: Date.now() - start,
              error: `Expected response for "${prompt.id}", got ${response.type}`,
            };
          }

          if (response.requestId !== prompt.id) {
            return {
              name: "multi-turn",
              passed: false,
              skipped: false,
              duration: Date.now() - start,
              error: `requestId mismatch: expected "${prompt.id}", got "${response.requestId}"`,
            };
          }

          if (!("text" in response) || !response.text.trim()) {
            return {
              name: "multi-turn",
              passed: false,
              skipped: false,
              duration: Date.now() - start,
              error: `Empty response for "${prompt.text}"`,
            };
          }
        }

        // Send call_end
        mock.sendCallEnd(callId, 30, "browser");
        await new Promise((resolve) => setTimeout(resolve, 500));

        if (!mock.isConnected()) {
          return {
            name: "multi-turn",
            passed: false,
            skipped: false,
            duration: Date.now() - start,
            error: "Plugin disconnected during multi-turn call",
          };
        }

        return {
          name: "multi-turn",
          passed: true,
          skipped: false,
          duration: Date.now() - start,
        };
      } catch (err) {
        return {
          name: "multi-turn",
          passed: false,
          skipped: false,
          duration: Date.now() - start,
          error: String(err),
        };
      }
    },
  };
}
