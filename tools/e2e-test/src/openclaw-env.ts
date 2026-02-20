/**
 * Isolated OpenClaw environment setup.
 *
 * Creates a temp OPENCLAW_STATE_DIR, installs OpenClaw, installs the plugin
 * (local link mode or npm spec mode), and writes config so the gateway loads
 * the CrabCallr plugin pointing at the local mock ws-manager.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execSync } from "child_process";
import * as log from "./logger.js";

export interface OpenClawEnvOptions {
  openclawVersion: string;
  wsManagerPort: number;
  apiKeyEnv: string;
  model: string;
  pluginInstallMode: "link" | "npm";
  pluginSpec: string;
  pinPluginSpec: boolean;
  verbose: boolean;
}

export interface OpenClawEnv {
  tmpDir: string;
  stateDir: string;
  openclawBin: string;
  installDir: string;
}

const E2E_API_KEY = "cc_e2e_test_0000000000000000000000";
const E2E_GATEWAY_TOKEN = "e2e-test-token";

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

  // 2. Install CrabCallr plugin into OpenClaw state dir.
  if (opts.pluginInstallMode === "link") {
    const pluginDir = pluginRoot();
    log.info("Building openclaw-plugin...");
    execSync("npm run build", {
      cwd: pluginDir,
      stdio: opts.verbose ? "inherit" : "pipe",
      timeout: 60_000,
    });

    log.info("Installing plugin from local path (link mode)...");
    execSync(`"${openclawBin}" plugins install --link "${pluginDir}"`, {
      cwd: installDir,
      stdio: opts.verbose ? "inherit" : "pipe",
      timeout: 30_000,
      env: { ...process.env, OPENCLAW_STATE_DIR: stateDir, OPENCLAW_HOME: tmpDir },
    });
  } else {
    const pluginSpec = opts.pluginSpec.trim();
    if (!pluginSpec) {
      throw new Error("pluginSpec is required when pluginInstallMode=npm");
    }

    const pinArg = opts.pinPluginSpec ? " --pin" : "";
    log.info(`Installing plugin from npm spec: ${pluginSpec}${opts.pinPluginSpec ? " (pinned)" : ""}`);
    execSync(`"${openclawBin}" plugins install${pinArg} "${pluginSpec}"`, {
      cwd: installDir,
      stdio: opts.verbose ? "inherit" : "pipe",
      timeout: 30_000,
      env: { ...process.env, OPENCLAW_STATE_DIR: stateDir, OPENCLAW_HOME: tmpDir },
    });
  }

  // 3. Merge channel + gateway config into openclaw.json
  //    `plugins install` already wrote state/openclaw.json with plugin entries;
  //    we merge our settings into that file so the gateway picks them up.
  const configPath = path.join(stateDir, "openclaw.json");
  const existingConfig: Record<string, unknown> = fs.existsSync(configPath)
    ? JSON.parse(fs.readFileSync(configPath, "utf-8"))
    : {};

  const serviceUrl = `ws://localhost:${opts.wsManagerPort}/plugin`;

  const merged: Record<string, unknown> = {
    ...existingConfig,
    plugins: {
      ...(typeof existingConfig.plugins === "object" && existingConfig.plugins !== null
        ? existingConfig.plugins
        : {}),
      allow: ["crabcallr"],
    },
    session: {
      dmScope: "per-channel-peer",
    },
    gateway: {
      auth: {
        token: E2E_GATEWAY_TOKEN,
      },
    },
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

  // Set model config
  const apiKey = process.env[opts.apiKeyEnv];
  if (!apiKey) {
    throw new Error(
      `${opts.apiKeyEnv} environment variable must be set`,
    );
  }
  merged.agents = {
    defaults: {
      model: {
        primary: opts.model,
      },
    },
  };

  fs.writeFileSync(configPath, JSON.stringify(merged, null, 2));
  log.debug(`Wrote openclaw.json to ${stateDir}`);

  // 4. Write auth-profiles.json for the default agent
  {
    const agentDir = path.join(stateDir, "agents", "main", "agent");
    fs.mkdirSync(agentDir, { recursive: true });

    // Determine the provider from the model string
    let providerKey = "anthropic";
    if (opts.model.startsWith("openai/") || opts.model.startsWith("gpt-")) {
      providerKey = "openai";
    }

    const authStore = {
      version: 1,
      profiles: {
        [providerKey]: {
          type: "api_key",
          provider: providerKey,
          apiKey,
        },
      },
    };

    fs.writeFileSync(
      path.join(agentDir, "auth-profiles.json"),
      JSON.stringify(authStore, null, 2),
    );
    log.debug("Wrote auth-profiles");
  }

  return { tmpDir, stateDir, openclawBin, installDir };
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
