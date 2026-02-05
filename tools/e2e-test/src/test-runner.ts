/**
 * Test runner: orchestrates setup → scenarios → teardown → report
 */

import { MockWsManager } from "./mock-ws-manager.js";
import { createOpenClawEnv, cleanupOpenClawEnv, type OpenClawEnv } from "./openclaw-env.js";
import { OpenClawProcess } from "./openclaw-process.js";
import { createAllScenarios } from "./scenarios/index.js";
import type { CliOptions, TestContext, TestResult, TestScenario } from "./types.js";
import * as log from "./logger.js";

export async function runTests(opts: CliOptions): Promise<number> {
  let mock: MockWsManager | null = null;
  let openclawEnv: OpenClawEnv | null = null;
  let openclawProcess: OpenClawProcess | null = null;

  const cleanup = async () => {
    if (openclawProcess) {
      await openclawProcess.stop().catch(() => {});
      openclawProcess = null;
    }
    if (mock) {
      await mock.stop().catch(() => {});
      mock = null;
    }
    if (openclawEnv && !opts.keepEnv) {
      cleanupOpenClawEnv(openclawEnv);
      openclawEnv = null;
    } else if (openclawEnv && opts.keepEnv) {
      log.info(`Preserving temp dir: ${openclawEnv.stateDir}`);
    }
  };

  // Signal handlers for cleanup
  const signalHandler = () => {
    log.info("Caught signal, cleaning up...");
    void cleanup().then(() => process.exit(2));
  };
  process.on("SIGINT", signalHandler);
  process.on("SIGTERM", signalHandler);

  try {
    const mode = opts.live ? "live" : "protocol";
    log.header(`CrabCallr E2E Tests (${mode} mode)`);

    // 1. Start mock ws-manager
    log.info("Starting mock ws-manager...");
    mock = new MockWsManager();
    await mock.start(opts.port);

    // 2. Create OpenClaw environment
    log.info("Setting up OpenClaw environment...");
    openclawEnv = await createOpenClawEnv({
      openclawVersion: opts.openclawVersion,
      wsManagerPort: opts.port,
      live: opts.live,
      apiKeyEnv: opts.apiKeyEnv,
      model: opts.model,
      verbose: opts.verbose,
    });

    // 3. Start OpenClaw gateway
    log.info("Starting OpenClaw gateway...");
    openclawProcess = new OpenClawProcess();

    const processEnv: Record<string, string> = {};
    if (opts.live) {
      const apiKey = process.env[opts.apiKeyEnv];
      if (apiKey) {
        processEnv[opts.apiKeyEnv] = apiKey;
      }
    }

    await openclawProcess.start({
      openclawBin: openclawEnv.openclawBin,
      stateDir: openclawEnv.stateDir,
      verbose: opts.verbose,
      env: processEnv,
    });

    // 4. Wait for plugin to connect
    log.info("Waiting for plugin to connect...");
    try {
      await mock.waitForConnection(30_000);
    } catch {
      log.error("Plugin did not connect within 30s");
      log.error("This means the OpenClaw gateway started but the plugin did not connect.");
      await cleanup();
      return 2;
    }
    log.success("Plugin connected and authenticated");

    // 5. Create and filter scenarios
    const allScenarios = createAllScenarios(mock);
    let scenarios: TestScenario[];

    if (opts.scenario) {
      const names = opts.scenario.split(",").map((s) => s.trim());
      scenarios = allScenarios.filter((s) => names.includes(s.name));
      if (scenarios.length === 0) {
        log.error(`No scenarios match: ${opts.scenario}`);
        log.info(`Available: ${allScenarios.map((s) => s.name).join(", ")}`);
        await cleanup();
        return 2;
      }
    } else {
      scenarios = allScenarios;
    }

    // 6. Run scenarios
    log.header("Running scenarios");
    const ctx: TestContext = {
      mode,
      verbose: opts.verbose,
      timeout: opts.timeout,
    };

    const results: TestResult[] = [];
    const runStart = Date.now();

    for (const scenario of scenarios) {
      if (scenario.liveOnly && mode !== "live") {
        const result: TestResult = {
          name: scenario.name,
          passed: false,
          skipped: true,
          duration: 0,
        };
        results.push(result);
        log.testSkip(scenario.name);
        continue;
      }

      const result = await scenario.run(ctx);
      results.push(result);

      if (result.passed) {
        log.testPass(result.name, result.duration);
      } else if (result.skipped) {
        log.testSkip(result.name);
      } else {
        log.testFail(result.name, result.duration, result.error ?? "Unknown error");
      }
    }

    const totalDuration = Date.now() - runStart;
    const passed = results.filter((r) => r.passed).length;
    const failed = results.filter((r) => !r.passed && !r.skipped).length;
    const skipped = results.filter((r) => r.skipped).length;

    log.summary(passed, failed, skipped, totalDuration);

    // 7. Teardown
    await cleanup();

    return failed > 0 ? 1 : 0;
  } catch (err) {
    log.error(`Setup error: ${String(err)}`);
    await cleanup();
    return 2;
  } finally {
    process.removeListener("SIGINT", signalHandler);
    process.removeListener("SIGTERM", signalHandler);
  }
}
