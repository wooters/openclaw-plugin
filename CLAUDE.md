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
- **src/websocket.ts** - `CrabCallrWebSocket` class managing persistent connection to CrabCallr service. Handles authentication, reconnection with exponential backoff, ping/pong keepalive, and call lifecycle events.
- **src/types.ts** - All TypeScript interfaces including PluginAPI, channel plugin types, message types (AUTH, TRANSCRIPT, RESPONSE, etc.), and config schema.
- **src/config.ts** - Configuration validation and defaults.

### Message Flow

1. CrabCallr service sends `TRANSCRIPT` messages (user speech)
2. Plugin forwards text to OpenClaw via `api.inbound.receiveMessage()` as a channel message
3. OpenClaw agent processes and responds via channel's `outbound.sendText()`
4. Plugin sends `RESPONSE` message back to CrabCallr service
5. CrabCallr service converts to speech

### Voice Skill

The `skills/crabcallr/SKILL.md` skill is automatically loaded when the plugin is enabled. It instructs the LLM to produce concise, spoken-friendly responses without markdown, code blocks, or bullet points.

### Plugin Manifest

`openclaw.plugin.json` defines the plugin ID, channel metadata (label, docsPath, blurb, aliases), skill paths, and configuration schema requiring an `apiKey` (format: `cc_*`). Config is located at `channels.crabcallr.accounts.default`.
