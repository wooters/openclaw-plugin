import type { PluginRuntime } from "openclaw/plugin-sdk";

let runtime: PluginRuntime | null = null;

export function setCrabCallrRuntime(next: PluginRuntime) {
  runtime = next;
}

export function getCrabCallrRuntime(): PluginRuntime {
  if (!runtime) {
    throw new Error("CrabCallr runtime not initialized");
  }
  return runtime;
}
