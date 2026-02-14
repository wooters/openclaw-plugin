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
