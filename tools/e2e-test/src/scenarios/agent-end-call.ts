/**
 * Scenario: Agent-initiated end call — the LLM calls crabcallr_end_call and the
 * plugin routes the farewell through utterance(endCall=true) or call_end_request.
 *
 * Live-only: requires the LLM to invoke the crabcallr_end_call tool.
 */

import type { MockWsManager } from "../mock-ws-manager.js";
import type { TestContext, TestResult, TestScenario } from "../types.js";

export function createAgentEndCallScenario(mock: MockWsManager): TestScenario {
  return {
    name: "agent-end-call",
    description: "Agent-initiated end call via crabcallr_end_call tool (live mode only)",
    liveOnly: true,
    timeout: 60_000,
    async run(ctx: TestContext): Promise<TestResult> {
      const start = Date.now();
      try {
        if (!mock.isConnected()) {
          return {
            name: "agent-end-call",
            passed: false,
            skipped: false,
            duration: Date.now() - start,
            error: "Plugin not connected",
          };
        }

        const callId = "test-call-end";
        let msgSeq = 1;

        // Re-send call_start + user_message whenever the plugin reconnects.
        // OpenClaw's auto-restart creates a new plugin instance that doesn't
        // know about the ongoing call, so we need to re-establish context.
        // Use incrementing messageIds to avoid gateway deduplication — after
        // an auto-restart the old channel outbound is lost, so we need the
        // gateway to dispatch a fresh reply through the new plugin instance.
        const resendOnReconnect = () => {
          msgSeq++;
          mock.sendCallStart(callId, "browser");
          mock.sendUserMessage(`usr_${String(msgSeq).padStart(3, "0")}`, "Great, thanks. Talk to you later.", callId);
        };
        mock.on("authenticated", resendOnReconnect);

        try {
          // Start a call and send the farewell message
          mock.sendCallStart(callId, "browser");
          await new Promise((resolve) => setTimeout(resolve, 500));
          mock.clearReceivedMessages();
          mock.sendUserMessage("usr_001", "Great, thanks. Talk to you later.", callId);

          // Wait for utterance(endCall=true) or call_end_request, skipping
          // filler utterances the plugin may send while the LLM is thinking.
          const deadline = Date.now() + ctx.timeout;
          let gotEndCall = false;
          let lastUtteranceText = "";

          while (Date.now() < deadline) {
            const remaining = deadline - Date.now();
            if (remaining <= 0) break;

            let result;
            try {
              result = await Promise.race([
                mock.waitForUtterance(remaining),
                mock.waitForMessage("call_end_request", remaining),
              ]);
            } catch {
              break; // timeout
            }

            if (result.type === "call_end_request") {
              if ("callId" in result && result.callId === callId) {
                gotEndCall = true;
                break;
              }
            }

            if (result.type === "utterance") {
              if ("text" in result) lastUtteranceText = result.text as string;
              if ("endCall" in result && result.endCall === true) {
                if (!lastUtteranceText.trim()) {
                  return {
                    name: "agent-end-call",
                    passed: false,
                    skipped: false,
                    duration: Date.now() - start,
                    error: "Received utterance(endCall=true) but text is empty",
                  };
                }
                gotEndCall = true;
                break;
              }
              // Filler utterance (no endCall) — clear and keep waiting
              mock.clearReceivedMessages();
              continue;
            }
          }

          if (!gotEndCall) {
            return {
              name: "agent-end-call",
              passed: false,
              skipped: false,
              duration: Date.now() - start,
              error: "Expected agent to call crabcallr_end_call tool but no endCall signal received within timeout",
            };
          }

          // Clean up: send call_end
          mock.sendCallEnd(callId, 5, "browser");
          await new Promise((resolve) => setTimeout(resolve, 500));

          return {
            name: "agent-end-call",
            passed: true,
            skipped: false,
            duration: Date.now() - start,
          };
        } finally {
          mock.off("authenticated", resendOnReconnect);
        }
      } catch (err) {
        return {
          name: "agent-end-call",
          passed: false,
          skipped: false,
          duration: Date.now() - start,
          error: String(err),
        };
      }
    },
  };
}
