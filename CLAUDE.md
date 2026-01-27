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

This is a ClawdBot plugin that connects to the CallClawd hosted service via WebSocket, enabling voice calling (phone/browser) to a ClawdBot assistant.

### Core Components

- **src/index.ts** - Plugin entry point with `activate()` and `deactivate()` lifecycle hooks. Registers tools and CLI commands with ClawdBot Gateway. Handles transcript-to-response flow.
- **src/websocket.ts** - `CallClawdWebSocket` class managing persistent connection to CallClawd service. Handles authentication, reconnection with exponential backoff, ping/pong keepalive, and call lifecycle events.
- **src/types.ts** - All TypeScript interfaces including message types (AUTH, TRANSCRIPT, RESPONSE, etc.), config schema, and ClawdBot Gateway interface.
- **src/config.ts** - Configuration validation and defaults.

### Message Flow

1. CallClawd service sends `TRANSCRIPT` messages (user speech)
2. Plugin forwards text to ClawdBot via `gateway.sendMessage()` with voice context
3. ClawdBot response is sent back via `RESPONSE` message
4. CallClawd service converts to speech

### Voice Skill

The `skills/callclawd/SKILL.md` skill is automatically loaded when the plugin is enabled. It instructs the LLM to produce concise, spoken-friendly responses without markdown, code blocks, or bullet points.

### Plugin Manifest

`clawdbot.plugin.json` defines the plugin ID, entry point (`dist/index.js`), skill paths, and configuration schema requiring an `apiKey` (format: `cc_*`).
