/**
 * Scenario: Multiple user messages in a single call (live mode only)
 */

import type { MockWsManager } from "../mock-ws-manager.js";
import type { TestContext, TestResult, TestScenario } from "../types.js";

const PROMPTS = [
  { id: "usr_001", text: "What is 2 plus 2?" },
  { id: "usr_002", text: "Now multiply that by 3" },
  { id: "usr_003", text: "Thanks, goodbye" },
];

export function createMultiTurnScenario(mock: MockWsManager): TestScenario {
  return {
    name: "multi-turn",
    description: "Multiple user messages in a single call (live mode only)",
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

        // Send each user message and wait for utterance response
        const lastPromptId = PROMPTS[PROMPTS.length - 1].id;
        for (const prompt of PROMPTS) {
          mock.clearReceivedMessages();
          mock.sendUserMessage(prompt.id, prompt.text, callId);

          // The last prompt ("goodbye") may trigger crabcallr_end_call, which
          // routes the farewell through utterance(endCall=true) or call_end_request.
          // Accept either outcome for the final prompt.
          const isLast = prompt.id === lastPromptId;

          let response;
          try {
            if (isLast) {
              response = await Promise.race([
                mock.waitForUtterance(ctx.timeout),
                mock.waitForMessage("call_end_request", ctx.timeout),
              ]);
            } else {
              response = await mock.waitForUtterance(ctx.timeout);
            }
          } catch (err) {
            return {
              name: "multi-turn",
              passed: false,
              skipped: false,
              duration: Date.now() - start,
              error: `No utterance for "${prompt.text}": ${String(err)}`,
            };
          }

          // call_end_request is acceptable for the goodbye prompt
          if (isLast && response.type === "call_end_request") {
            continue;
          }

          if (response.type !== "utterance" || !("utteranceId" in response)) {
            return {
              name: "multi-turn",
              passed: false,
              skipped: false,
              duration: Date.now() - start,
              error: `Expected utterance for "${prompt.id}", got ${response.type}`,
            };
          }

          if (!response.utteranceId.startsWith("oc_")) {
            return {
              name: "multi-turn",
              passed: false,
              skipped: false,
              duration: Date.now() - start,
              error: `Invalid utteranceId format: "${response.utteranceId}"`,
            };
          }

          if (!("text" in response) || !response.text.trim()) {
            return {
              name: "multi-turn",
              passed: false,
              skipped: false,
              duration: Date.now() - start,
              error: `Empty utterance for "${prompt.text}"`,
            };
          }

          // utterance(endCall=true) is acceptable for the goodbye prompt
          if (isLast && response.endCall) {
            continue;
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
