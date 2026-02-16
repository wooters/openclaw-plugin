/**
 * Scenario: Protocol schema compliance
 *
 * Checks that all messages exchanged during the test run conform to the
 * canonical JSON Schema. This scenario should run LAST, after all other
 * scenarios have exercised the protocol.
 */

import type { MockWsManager } from "../mock-ws-manager.js";
import type { TestContext, TestResult, TestScenario } from "../types.js";

export function createProtocolSchemaScenario(mock: MockWsManager): TestScenario {
  return {
    name: "protocol-schema",
    description: "All messages conform to the protocol JSON Schema",
    async run(_ctx: TestContext): Promise<TestResult> {
      const start = Date.now();

      const violations = mock.getSchemaViolations();

      if (violations.length === 0) {
        return {
          name: "protocol-schema",
          passed: true,
          skipped: false,
          duration: Date.now() - start,
        };
      }

      const summary = violations
        .map(
          (v, i) =>
            `  ${i + 1}. [${v.direction}] type=${(v.message as { type?: string })?.type ?? "?"}: ${v.errors}`
        )
        .join("\n");

      return {
        name: "protocol-schema",
        passed: false,
        skipped: false,
        duration: Date.now() - start,
        error: `${violations.length} schema violation(s):\n${summary}`,
      };
    },
  };
}
