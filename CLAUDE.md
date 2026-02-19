# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands

```bash
npm install        # Install dependencies
npm run build      # Compile TypeScript to dist/
npm run dev        # Watch mode for development
npm run clean      # Remove dist directory
```

## Architecture

This is a OpenClaw plugin that connects to the CrabCallr hosted service via WebSocket, enabling voice calling (phone/browser) to a OpenClaw assistant.

### Core Components

- **src/index.ts** - Plugin entry point exporting a default `register(api: PluginAPI)` function. Registers as a channel plugin, service, tools, and CLI commands. Handles transcript-to-response flow via channel inbound/outbound APIs.
- **src/websocket.ts** - `CrabCallrWebSocket` class managing persistent connection to CrabCallr service. Handles authentication, reconnection with exponential backoff, and ping/pong keepalive.
- **src/types.ts** - All TypeScript interfaces including PluginAPI, channel plugin types, message types (AUTH, USER_MESSAGE, UTTERANCE, etc.), and config schema.
- **src/config.ts** - Configuration validation and defaults.

### Message Flow (fire-and-forget)

1. CrabCallr service sends `user_message` (user speech transcription)
2. Plugin forwards text to OpenClaw via `api.inbound.receiveMessage()` as a channel message
3. OpenClaw agent processes and responds via channel's `outbound.sendText()`
4. Plugin sends `utterance` message back to CrabCallr service (with turn-based ID `oc_NNN_MMM`)
5. CrabCallr service converts to speech via TTS

No request/response correlation — plugin sends utterances (responses, fillers, idle prompts, goodbyes) as fire-and-forget messages. The `endCall` flag on an utterance signals the call should end after speaking.

### Voice Skill

The `skills/crabcallr/SKILL.md` skill is automatically loaded when the plugin is enabled. It instructs the LLM to produce concise, spoken-friendly responses without markdown, code blocks, or bullet points.

### Plugin Manifest

`openclaw.plugin.json` defines the plugin ID, channel metadata (label, docsPath, blurb, aliases), skill paths, and configuration schema requiring an `apiKey` (format: `cc_*`). Config is located at `channels.crabcallr.accounts.default`.

## Protocol Schema

The protocol JSON Schema is at `protocol/crabcallr-protocol.schema.json` (copy of canonical from `crabcallr/shared/protocol/`). The E2E test mock-ws-manager validates all messages against this schema during test runs — schema violations are reported as failures in the `protocol-schema` scenario.

See `../CLAUDE.md` > Protocol Change Workflow for the full cross-repo update process.

## Testing

### E2E Plugin Tests (`tools/e2e-test/`)

End-to-end tests that verify the plugin works against a real OpenClaw gateway. The tool starts a **mock ws-manager** (local WebSocket server), spawns an **OpenClaw gateway**, installs the plugin (local link or npm spec), and runs test scenarios validating the full connection lifecycle.

**When to use:** After making changes to plugin code (WebSocket handling, auth, message routing, config). Run before committing to catch integration regressions. No external services or API keys are needed for protocol mode.

**Setup:**

```bash
cd tools/e2e-test
npm install
```

**Running tests:**

```bash
# Protocol mode — no LLM key needed, tests auth/connection/ping/call lifecycle
npm test

# Live mode — requires LLM key, tests full agent response pipeline
ANTHROPIC_API_KEY=sk-... npm run test:live

# Test against a specific OpenClaw version
npm test -- --openclaw-version 2026.2.3-1

# Install plugin from npm registry instead of local link
npm test -- --plugin-install-mode npm --plugin-spec @wooters/crabcallr

# Run a single scenario
npm test -- --scenario auth-connect

# Verbose output (shows all ws messages and gateway logs)
npm test -- --verbose
```

**Test scenarios:**

| Scenario | Mode | What it tests |
|----------|------|---------------|
| `auth-connect` | protocol + live | Plugin connects, sends `cc_*` API key, stays connected |
| `ping-pong` | protocol + live | Mock sends ping, plugin responds with pong |
| `ws-heartbeat` | protocol + live | Mock sends WebSocket ping control frame, plugin returns pong control frame |
| `call-lifecycle` | protocol + live | call_start → user_message → (utterance in live) → call_end |
| `multi-turn` | live only | 3 sequential user_messages in one call with LLM utterances |
| `agent-end-call` | live only | Agent calls crabcallr_end_call tool → utterance(endCall=true) or call_end_request |
| `protocol-schema` | protocol + live | All plugin↔manager JSON messages conform to schema |

**Exit codes:** `0` = all pass, `1` = test failure, `2` = setup/infra error.

**How it works:** The tool creates an isolated temp directory with `OPENCLAW_STATE_DIR` and `OPENCLAW_HOME` set, installs OpenClaw, installs the plugin (local link or npm spec), writes config pointing at `ws://localhost:19876/plugin`, and spawns `openclaw gateway`. The mock ws-manager validates the plugin's auth message, responds to app-level ping/pong and WebSocket heartbeat pings, and sends test call/user_message messages. See `tools/e2e-test/src/mock-ws-manager.ts` for the protocol implementation.

**Key CLI flags:**

| Flag | Default | Description |
|------|---------|-------------|
| `--openclaw-version <ver>` | `latest` | OpenClaw npm version |
| `--live` | `false` | Enable live mode (real LLM) |
| `--port <n>` | `19876` | Mock ws-manager port |
| `--scenario <name>` | all | Run specific scenario(s) |
| `--timeout <ms>` | `30000` | Per-scenario timeout |
| `--verbose` | `false` | Verbose logging |
| `--keep-env` | `false` | Preserve temp dir after run |
| `--api-key-env <var>` | `ANTHROPIC_API_KEY` | Env var for LLM key |
| `--model <id>` | `anthropic/claude-sonnet-4-6` | LLM model for live mode |
| `--plugin-install-mode <mode>` | `link` | Plugin install path: `link` (local source) or `npm` (registry spec) |
| `--plugin-spec <spec>` | `@wooters/crabcallr` | npm spec used when `--plugin-install-mode npm` |
| `--pin-plugin-spec` | `false` | Pass `--pin` to `openclaw plugins install` for npm installs |
