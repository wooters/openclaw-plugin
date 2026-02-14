/**
 * CrabCallr Plugin for OpenClaw
 *
 * Voice calling via phone or browser through the CrabCallr service.
 */

import { createRequire } from "module";
import { Type } from "@sinclair/typebox";
import type { GatewayRequestHandlerOptions, OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import {
  crabcallrPlugin,
  endCrabCallrCall,
  getCrabCallrStatus,
  sendCrabCallrResponse,
} from "./channel.js";
import { setCrabCallrRuntime } from "./runtime.js";

const require = createRequire(import.meta.url);
const { version: PLUGIN_VERSION } = require("../package.json") as { version: string };

const plugin = {
  id: "crabcallr",
  name: "CrabCallr",
  description: "CrabCallr voice channel plugin",
  version: PLUGIN_VERSION,
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    setCrabCallrRuntime(api.runtime);

    api.registerChannel({ plugin: crabcallrPlugin });

    api.registerTool({
      name: "crabcallr_status",
      label: "CrabCallr Status",
      description: "Get the current status of the CrabCallr voice connection.",
      parameters: Type.Object({}),
      async execute(_toolCallId: string, _params: Record<string, unknown>) {
        const status = getCrabCallrStatus();
        return {
          content: [{ type: "text", text: JSON.stringify(status, null, 2) }],
          details: status,
        };
      },
    });

    api.registerTool({
      name: "crabcallr_end_call",
      label: "End Call",
      description:
        "End the current voice call. Your response will be spoken as the farewell message before the call disconnects.",
      parameters: Type.Object({}),
      async execute(_toolCallId: string, _params: Record<string, unknown>) {
        const result = endCrabCallrCall();
        if (!result.ok) {
          return {
            content: [{ type: "text", text: result.error ?? "Failed to end call" }],
            details: result,
            isError: true,
          };
        }
        return {
          content: [
            {
              type: "text",
              text: "Call end confirmed. Your response will be spoken as the farewell.",
            },
          ],
          details: result,
        };
      },
    });

    api.registerGatewayMethod(
      "crabcallr.status",
      ({ respond, params }: GatewayRequestHandlerOptions) => {
      const accountId = typeof params?.accountId === "string" ? params.accountId : undefined;
      respond(true, getCrabCallrStatus(accountId));
      },
    );

    api.registerGatewayMethod(
      "crabcallr.speak",
      ({ respond, params }: GatewayRequestHandlerOptions) => {
      const requestId =
        typeof params?.requestId === "string" ? params.requestId.trim() : "";
      const text = typeof params?.text === "string" ? params.text.trim() : "";
      const accountId = typeof params?.accountId === "string" ? params.accountId : undefined;

      if (!requestId || !text) {
        respond(false, { error: "Missing requestId or text parameter" });
        return;
      }

      const result = sendCrabCallrResponse({ accountId, requestId, text });
      if (!result.ok) {
        respond(false, { error: result.error });
        return;
      }
      respond(true, { ok: true, requestId });
      },
    );
  },
};

export default plugin;
export type { CrabCallrConfig, ConnectionStatus } from "./types.js";
