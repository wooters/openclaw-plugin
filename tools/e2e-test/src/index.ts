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
  .option("--live", "Enable live mode (real LLM responses)", false)
  .option("--port <n>", "Mock ws-manager port", "19876")
  .option("--scenario <name>", "Run specific scenario(s), comma-separated")
  .option("--timeout <ms>", "Per-scenario timeout in ms", "30000")
  .option("--verbose", "Verbose logging", false)
  .option("--keep-env", "Preserve temp OpenClaw dir after run", false)
  .option(
    "--api-key-env <var>",
    "Env var for LLM API key (live mode)",
    "ANTHROPIC_API_KEY",
  )
  .option(
    "--model <id>",
    "LLM model for live mode",
    "anthropic/claude-haiku-4-5-20251001",
  )
  .action(async (rawOpts: Record<string, unknown>) => {
    const opts: CliOptions = {
      openclawVersion: rawOpts.openclawVersion as string,
      live: rawOpts.live as boolean,
      port: parseInt(rawOpts.port as string, 10),
      scenario: rawOpts.scenario as string | undefined,
      timeout: parseInt(rawOpts.timeout as string, 10),
      verbose: rawOpts.verbose as boolean,
      keepEnv: rawOpts.keepEnv as boolean,
      apiKeyEnv: rawOpts.apiKeyEnv as string,
      model: rawOpts.model as string,
    };

    setVerbose(opts.verbose);
    const exitCode = await runTests(opts);
    process.exit(exitCode);
  });

program.parse();
