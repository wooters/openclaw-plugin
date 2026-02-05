/**
 * Isolated OpenClaw environment setup.
 *
 * Creates a temp OPENCLAW_STATE_DIR, installs OpenClaw, builds the plugin,
 * links it, and writes config so the gateway loads the CrabCallr plugin
 * pointing at the local mock ws-manager.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execSync } from "child_process";
import * as log from "./logger.js";

export interface OpenClawEnvOptions {
  openclawVersion: string;
  wsManagerPort: number;
  live: boolean;
  apiKeyEnv: string;
  model: string;
  verbose: boolean;
}

export interface OpenClawEnv {
  stateDir: string;
  openclawBin: string;
  installDir: string;
}

const E2E_API_KEY = "cc_e2e_test_0000000000000000000000";

/** Resolve the absolute path to the openclaw-plugin root (two levels up from this file's directory) */
function pluginRoot(): string {
  // tools/e2e-test/src/ → tools/e2e-test/ → tools/ → openclaw-plugin/
  return path.resolve(import.meta.dirname, "..", "..", "..");
}

export async function createOpenClawEnv(opts: OpenClawEnvOptions): Promise<OpenClawEnv> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "crabcallr-e2e-"));
  log.info(`Temp directory: ${tmpDir}`);

  const stateDir = path.join(tmpDir, "state");
  const installDir = path.join(tmpDir, "openclaw-install");
  fs.mkdirSync(stateDir, { recursive: true });
  fs.mkdirSync(installDir, { recursive: true });

  // 1. Install OpenClaw into installDir
  const spec = `openclaw@${opts.openclawVersion}`;
  log.info(`Installing ${spec}...`);
  execSync(`npm install ${spec}`, {
    cwd: installDir,
    stdio: opts.verbose ? "inherit" : "pipe",
    timeout: 120_000,
  });

  const openclawBin = path.join(installDir, "node_modules", ".bin", "openclaw");
  if (!fs.existsSync(openclawBin)) {
    throw new Error(`OpenClaw binary not found at ${openclawBin}`);
  }
  log.info(`OpenClaw binary: ${openclawBin}`);

  // 2. Build the plugin
  const pluginDir = pluginRoot();
  log.info("Building openclaw-plugin...");
  execSync("npm run build", {
    cwd: pluginDir,
    stdio: opts.verbose ? "inherit" : "pipe",
    timeout: 60_000,
  });

  // 3. Link the plugin into the OpenClaw state dir
  log.info("Linking plugin into OpenClaw environment...");
  execSync(`"${openclawBin}" plugins install -l "${pluginDir}"`, {
    cwd: installDir,
    stdio: opts.verbose ? "inherit" : "pipe",
    timeout: 30_000,
    env: { ...process.env, OPENCLAW_STATE_DIR: stateDir },
  });

  // 4. Write openclaw.json config
  const configDir = path.join(stateDir, "config");
  fs.mkdirSync(configDir, { recursive: true });

  const serviceUrl = `ws://localhost:${opts.wsManagerPort}/plugin`;

  const openclawConfig: Record<string, unknown> = {
    channels: {
      crabcallr: {
        accounts: {
          default: {
            apiKey: E2E_API_KEY,
            serviceUrl,
            autoConnect: true,
            reconnectInterval: 2000,
            maxReconnectAttempts: 3,
          },
        },
      },
    },
  };

  // For live mode, set model config
  if (opts.live) {
    const apiKey = process.env[opts.apiKeyEnv];
    if (!apiKey) {
      throw new Error(
        `Live mode requires ${opts.apiKeyEnv} environment variable to be set`,
      );
    }
    openclawConfig.llm = {
      model: opts.model,
    };
  }

  fs.writeFileSync(
    path.join(configDir, "openclaw.json"),
    JSON.stringify(openclawConfig, null, 2),
  );
  log.debug(`Wrote openclaw.json to ${configDir}`);

  // 5. Write minimal AGENTS.md
  const agentsDir = path.join(stateDir, "agents");
  fs.mkdirSync(agentsDir, { recursive: true });
  fs.writeFileSync(
    path.join(agentsDir, "AGENTS.md"),
    "You are a test assistant. Keep responses to one sentence.\n",
  );

  // 6. For live mode, write credentials
  if (opts.live) {
    const apiKey = process.env[opts.apiKeyEnv];
    const credentialsDir = path.join(stateDir, "credentials");
    fs.mkdirSync(credentialsDir, { recursive: true });

    // Determine the provider from the model string
    let providerKey = "anthropic";
    if (opts.model.startsWith("openai/") || opts.model.startsWith("gpt-")) {
      providerKey = "openai";
    }

    const credentials: Record<string, unknown> = {};
    credentials[providerKey] = { apiKey };

    fs.writeFileSync(
      path.join(credentialsDir, "credentials.json"),
      JSON.stringify(credentials, null, 2),
    );
    log.debug("Wrote credentials for live mode");
  }

  return { stateDir, openclawBin, installDir };
}

export function cleanupOpenClawEnv(env: OpenClawEnv): void {
  const tmpDir = path.dirname(env.stateDir);
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    log.info(`Cleaned up temp directory: ${tmpDir}`);
  } catch (err) {
    log.warn(`Failed to clean up temp directory: ${String(err)}`);
  }
}
