# CLAUDE.md

## Core Engineering Principles

1. **Clarity over cleverness** — Write code that's maintainable, not impressive
2. **Explicit over implicit** — No magic. Make behavior obvious
3. **Composition over inheritance** — Small units that combine
4. **Fail fast, fail loud** — Surface errors at the source
5. **Delete code** — Less code = fewer bugs. Question every addition
6. **Verify, don't assume** — Run it. Test it. Prove it works

## Message Flow (fire-and-forget)

1. CrabCallr service sends `user_message` (user speech transcription)
2. Plugin forwards text to OpenClaw via `api.inbound.receiveMessage()` as a channel message
3. OpenClaw agent processes and responds via channel's `outbound.sendText()`
4. Plugin sends `utterance` message back to CrabCallr service (with turn-based ID `oc_NNN_MMM`)
5. CrabCallr service converts to speech via TTS

No request/response correlation — plugin sends utterances (responses, fillers, idle prompts, goodbyes) as fire-and-forget messages. The `endCall` flag on an utterance signals the call should end after speaking.

## Voice Skill

The `skills/crabcallr/SKILL.md` skill is automatically loaded when the plugin is enabled. It instructs the LLM to produce concise, spoken-friendly responses without markdown, code blocks, or bullet points.

## Plugin Manifest

`openclaw.plugin.json` defines the plugin ID, channel metadata (label, docsPath, blurb, aliases), skill paths, and configuration schema requiring an `apiKey` (format: `cc_*`). Config is located at `channels.crabcallr.accounts.default`.

## Protocol Schema

The protocol JSON Schema is at `protocol/crabcallr-protocol.schema.json` (copy of canonical from `crabcallr/shared/protocol/`). The E2E test mock-ws-manager validates all messages against this schema during test runs — schema violations are reported as failures in the `protocol-schema` scenario.

See the parent monorepo's `CLAUDE.md` > Protocol Change Workflow for the full cross-repo update process.

## E2E Plugin Tests (`tools/e2e-test/`)

End-to-end tests that verify the plugin works against a real OpenClaw gateway. The tool starts a **mock ws-manager** (local WebSocket server), spawns an **OpenClaw gateway**, installs the plugin (local link or npm spec), and runs test scenarios.

**When to use:** After making changes to plugin code. Run before committing to catch integration regressions. Requires `ANTHROPIC_API_KEY`.

```bash
cd tools/e2e-test
npm install
npm test                                          # run all scenarios
npm test -- --openclaw-version 2026.2.3-1         # specific OpenClaw version
npm test -- --plugin-install-mode npm --plugin-spec @wooters/crabcallr  # from npm registry
npm test -- --scenario auth-connect --verbose     # single scenario, verbose
```

**Test scenarios:**

| Scenario | What it tests |
|----------|---------------|
| `auth-connect` | Plugin connects, sends `cc_*` API key, stays connected |
| `ping-pong` | Mock sends ping, plugin responds with pong |
| `ws-heartbeat` | Mock sends WebSocket ping control frame, plugin returns pong control frame |
| `call-lifecycle` | call_start → user_message → utterance → call_end |
| `multi-turn` | 2 sequential user_messages in one call with LLM utterances |
| `agent-end-call` | Agent calls crabcallr_end_call tool → utterance(endCall=true) or call_end_request |
| `protocol-schema` | All plugin↔manager JSON messages conform to schema |

Each scenario gets an isolated OpenClaw session (via `session.dmScope = "per-channel-peer"`) keyed by its `callId`, preventing conversation history from bleeding across scenarios.
