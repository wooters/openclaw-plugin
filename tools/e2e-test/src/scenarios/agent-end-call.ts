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

        // Start a call
        mock.sendCallStart(callId, "browser");
        await new Promise((resolve) => setTimeout(resolve, 500));
        mock.clearReceivedMessages();

        // Ask the agent to end the call — phrased so the LLM reliably invokes
        // the crabcallr_end_call tool per SKILL.md instructions.
        mock.sendUserMessage("usr_001", "I need to go now, please end this call and say goodbye.", callId);

        // Wait for one of two outcomes:
        //   utterance(endCall=true)  → pass (farewell with hangup)
        //   call_end_request         → pass (silent hangup)
        let result;
        try {
          result = await Promise.race([
            mock.waitForUtterance(ctx.timeout),
            mock.waitForMessage("call_end_request", ctx.timeout),
          ]);
        } catch (err) {
          return {
            name: "agent-end-call",
            passed: false,
            skipped: false,
            duration: Date.now() - start,
            error: `No end-call signal received: ${String(err)}`,
          };
        }

        // utterance with endCall=true — expected path when agent says goodbye
        if (result.type === "utterance") {
          if (!("endCall" in result) || result.endCall !== true) {
            // Got an utterance without endCall — this is a normal response,
            // meaning the LLM didn't call the crabcallr_end_call tool
            return {
              name: "agent-end-call",
              passed: false,
              skipped: false,
              duration: Date.now() - start,
              error: "Expected agent to call crabcallr_end_call tool but got a normal utterance",
            };
          }
          if (!("text" in result) || !result.text.trim()) {
            return {
              name: "agent-end-call",
              passed: false,
              skipped: false,
              duration: Date.now() - start,
              error: "Received utterance(endCall=true) but text is empty",
            };
          }
          // Pass — farewell with hangup
        } else if (result.type === "call_end_request") {
          // Silent hangup — also acceptable
          if (!("callId" in result) || result.callId !== callId) {
            return {
              name: "agent-end-call",
              passed: false,
              skipped: false,
              duration: Date.now() - start,
              error: `call_end_request callId mismatch: expected "${callId}", got "${"callId" in result ? result.callId : "N/A"}"`,
            };
          }
        }

        // Clean up: send call_end
        mock.sendCallEnd(callId, 5, "browser");
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Verify plugin stays connected
        if (!mock.isConnected()) {
          return {
            name: "agent-end-call",
            passed: false,
            skipped: false,
            duration: Date.now() - start,
            error: "Plugin disconnected after agent-initiated end call",
          };
        }

        return {
          name: "agent-end-call",
          passed: true,
          skipped: false,
          duration: Date.now() - start,
        };
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
