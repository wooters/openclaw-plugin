/**
 * Spawn and manage the OpenClaw gateway child process.
 */

import { spawn, type ChildProcess } from "child_process";
import * as log from "./logger.js";

export interface OpenClawProcessOptions {
  openclawBin: string;
  stateDir: string;
  port?: number;
  env?: Record<string, string>;
  verbose: boolean;
}

export class OpenClawProcess {
  private child: ChildProcess | null = null;
  private exitCode: number | null = null;
  private exitHandlers: Array<(code: number) => void> = [];

  async start(opts: OpenClawProcessOptions): Promise<void> {
    const args = ["gateway", "--allow-unconfigured"];
    if (opts.port) {
      args.push("--port", String(opts.port));
    }
    if (opts.verbose) {
      args.push("--verbose");
    }

    const env: Record<string, string> = {
      ...process.env as Record<string, string>,
      OPENCLAW_STATE_DIR: opts.stateDir,
      ...(opts.env ?? {}),
    };

    log.info(`Starting OpenClaw gateway: ${opts.openclawBin} ${args.join(" ")}`);
    log.debug(`OPENCLAW_STATE_DIR=${opts.stateDir}`);

    this.child = spawn(opts.openclawBin, args, {
      env,
      stdio: opts.verbose ? ["ignore", "inherit", "inherit"] : ["ignore", "pipe", "pipe"],
    });

    if (!opts.verbose && this.child.stdout) {
      this.child.stdout.on("data", (data: Buffer) => {
        for (const line of data.toString().split("\n").filter(Boolean)) {
          log.debug(`[openclaw] ${line}`);
        }
      });
    }

    if (!opts.verbose && this.child.stderr) {
      this.child.stderr.on("data", (data: Buffer) => {
        for (const line of data.toString().split("\n").filter(Boolean)) {
          log.debug(`[openclaw:err] ${line}`);
        }
      });
    }

    this.child.on("exit", (code) => {
      this.exitCode = code ?? 1;
      log.debug(`OpenClaw gateway exited with code ${this.exitCode}`);
      for (const handler of this.exitHandlers) {
        handler(this.exitCode);
      }
    });

    this.child.on("error", (err) => {
      log.error(`OpenClaw gateway error: ${err.message}`);
    });

    // Give a short delay to check the process didn't immediately crash
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.exitCode !== null) {
          reject(new Error(`OpenClaw gateway exited immediately with code ${this.exitCode}`));
        } else {
          resolve();
        }
      }, 1000);

      this.child?.on("exit", (code) => {
        clearTimeout(timer);
        reject(new Error(`OpenClaw gateway exited immediately with code ${code}`));
      });

      // If still running after 1s, resolve
      timer.unref();
    }).catch((err) => {
      // Only throw if we got an actual exit
      if (this.exitCode !== null) {
        throw err;
      }
    });
  }

  async stop(): Promise<void> {
    if (!this.child || this.exitCode !== null) {
      return;
    }

    log.info("Stopping OpenClaw gateway...");

    return new Promise((resolve) => {
      const killTimer = setTimeout(() => {
        log.warn("OpenClaw gateway did not stop gracefully, sending SIGKILL");
        this.child?.kill("SIGKILL");
      }, 5000);

      this.child?.on("exit", () => {
        clearTimeout(killTimer);
        resolve();
      });

      this.child?.kill("SIGTERM");
    });
  }

  isRunning(): boolean {
    return this.child !== null && this.exitCode === null;
  }

  onExit(handler: (code: number) => void): void {
    this.exitHandlers.push(handler);
    // If already exited, fire immediately
    if (this.exitCode !== null) {
      handler(this.exitCode);
    }
  }
}
