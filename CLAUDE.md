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

- **src/index.ts** - Plugin entry point with `activate()` and `deactivate()` lifecycle hooks. Registers tools and CLI commands with OpenClaw Gateway. Handles transcript-to-response flow.
- **src/websocket.ts** - `CrabCallrWebSocket` class managing persistent connection to CrabCallr service. Handles authentication, reconnection with exponential backoff, ping/pong keepalive, and call lifecycle events.
- **src/types.ts** - All TypeScript interfaces including message types (AUTH, TRANSCRIPT, RESPONSE, etc.), config schema, and OpenClaw Gateway interface.
- **src/config.ts** - Configuration validation and defaults.

### Message Flow

1. CrabCallr service sends `TRANSCRIPT` messages (user speech)
2. Plugin forwards text to OpenClaw via `gateway.sendMessage()` with voice context
3. OpenClaw response is sent back via `RESPONSE` message
4. CrabCallr service converts to speech

### Voice Skill

The `skills/crabcallr/SKILL.md` skill is automatically loaded when the plugin is enabled. It instructs the LLM to produce concise, spoken-friendly responses without markdown, code blocks, or bullet points.

### Plugin Manifest

`OpenClaw.plugin.json` defines the plugin ID, entry point (`dist/index.js`), skill paths, and configuration schema requiring an `apiKey` (format: `cc_*`).
