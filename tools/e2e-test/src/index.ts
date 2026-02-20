#!/usr/bin/env node
/**
 * CrabCallr E2E Test CLI
 *
 * Tests the openclaw-plugin against a real OpenClaw gateway by starting a
 * mock ws-manager locally and spawning the gateway as a child process.
 */

import { Command } from "commander";
import { setVerbose } from "./logger.js";
import { runTests } from "./test-runner.js";
import type { CliOptions } from "./types.js";

const program = new Command();

program
  .name("crabcallr-e2e-test")
  .description("E2E tests for the CrabCallr OpenClaw plugin")
  .option(
    "--openclaw-version <ver>",
    "OpenClaw npm version to test against",
    "latest",
  )
  .option("--port <n>", "Mock ws-manager port", "19876")
  .option("--scenario <name>", "Run specific scenario(s), comma-separated")
  .option("--timeout <ms>", "Per-scenario timeout in ms", "30000")
  .option("--verbose", "Verbose logging", false)
  .option("--keep-env", "Preserve temp OpenClaw dir after run", false)
  .option(
    "--api-key-env <var>",
    "Env var for LLM API key",
    "ANTHROPIC_API_KEY",
  )
  .option(
    "--model <id>",
    "LLM model",
    "anthropic/claude-haiku-4-5",
  )
  .option(
    "--plugin-install-mode <mode>",
    "How to install the CrabCallr plugin into OpenClaw: link | npm",
    "link",
  )
  .option(
    "--plugin-spec <spec>",
    "Plugin npm spec for --plugin-install-mode npm",
    "@wooters/crabcallr",
  )
  .option(
    "--pin-plugin-spec",
    "Pass --pin when installing plugin from npm spec",
    false,
  )
  .action(async (rawOpts: Record<string, unknown>) => {
    const installMode = rawOpts.pluginInstallMode as string;
    if (installMode !== "link" && installMode !== "npm") {
      console.error(
        `Invalid --plugin-install-mode: "${installMode}". Expected "link" or "npm".`,
      );
      process.exit(2);
    }

    const opts: CliOptions = {
      openclawVersion: rawOpts.openclawVersion as string,
      port: parseInt(rawOpts.port as string, 10),
      scenario: rawOpts.scenario as string | undefined,
      timeout: parseInt(rawOpts.timeout as string, 10),
      verbose: rawOpts.verbose as boolean,
      keepEnv: rawOpts.keepEnv as boolean,
      apiKeyEnv: rawOpts.apiKeyEnv as string,
      model: rawOpts.model as string,
      pluginInstallMode: installMode,
      pluginSpec: rawOpts.pluginSpec as string,
      pinPluginSpec: rawOpts.pinPluginSpec as boolean,
    };

    setVerbose(opts.verbose);
    const exitCode = await runTests(opts);
    process.exit(exitCode);
  });

program.parse();
