# CrabCallr Plugin for OpenClaw

[![npm version](https://img.shields.io/npm/v/@wooters/crabcallr)](https://www.npmjs.com/package/@wooters/crabcallr)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js >= 18](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)

Talk to your OpenClaw assistant via phone or browser with CrabCallr.

## Overview

CrabCallr is a voice interface that lets you have natural conversations with your OpenClaw assistant. This plugin connects your OpenClaw instance to the CrabCallr hosted service, enabling:

- **Browser calling** - Talk to OpenClaw from any web browser via WebRTC
- **Phone calling** - Call a phone number to reach your assistant (Basic tier)
- **Streaming speech recognition** - Real-time transcription with Deepgram
- **Natural voice responses** - High-quality text-to-speech with ElevenLabs
- **Barge-in support** - Interrupt the assistant mid-response

## Installation

```bash
openclaw plugins install @wooters/crabcallr
```

> **Note:** If you have a `plugins.allow` list in your `openclaw.json`, add `"crabcallr"` to it — otherwise the gateway won't load the plugin.

## Setup

1. **Get an API key** - Sign up at [crabcallr.com/app](https://crabcallr.com/app) and generate an API key

2. **Configure the plugin** - Add to your `~/.openclaw/openclaw.json`:

    ```json
    {
      "session": {
        "dmScope": "per-channel-peer"
      },
      "channels": {
        "crabcallr": {
          "accounts": {
            "default": {
              "apiKey": "cc_your_api_key_here"
            }
          }
        }
      }
    }
    ```

    > **Important:** The `session.dmScope` setting ensures each phone/browser call gets its own conversation history. Without it, OpenClaw uses a shared session and previous calls will bleed into new ones.

3. **Restart OpenClaw Gateway** - The plugin will automatically connect to the CrabCallr service

4. **Start calling** - Visit [crabcallr.com/app](https://crabcallr.com/app) and click "Call" to talk to your assistant

## Configuration Options

| Option                 | Type    | Default                         | Description                            |
| ---------------------- | ------- | ------------------------------- | -------------------------------------- |
| `apiKey`               | string  | (required)                      | Your CrabCallr API key                 |
| `serviceUrl`           | string  | `wss://ws.crabcallr.com/plugin` | WebSocket URL for the service          |
| `autoConnect`          | boolean | `true`                          | Connect automatically on startup       |
| `reconnectInterval`    | number  | `5000`                          | Reconnection interval in ms            |
| `maxReconnectAttempts` | number  | `10`                            | Max reconnect attempts (0 = unlimited) |

## Security Hardening

- Run OpenClaw's security audit regularly, especially after config/plugin changes:
  - `openclaw security audit --deep`
  - [OpenClaw Security (audit section)](https://docs.openclaw.ai/gateway/security#quick-check-openclaw-security-audit)
  - [OpenClaw CLI Security Reference](https://docs.openclaw.ai/reference/cli-reference#openclaw-security)
- Prefer pinned plugin versions for install/update operations:
  - `openclaw plugins install @wooters/crabcallr@0.5.0`
  - Re-run `openclaw plugins install @wooters/crabcallr@0.5.0` to stay on an exact version
- Treat plugins as trusted code and prefer explicit plugin allowlists in OpenClaw config:
  - [OpenClaw Plugins Safety Notes](https://docs.openclaw.ai/tools/plugin#safety-notes)
  - Example:
    ```json5
    {
      plugins: {
        allow: ["crabcallr"]
      }
    }
    ```
- Keep your OpenClaw config file private:
  - `chmod 600 ~/.openclaw/openclaw.json`

## CLI Commands

Check connection status:

```bash
openclaw channels status --probe
```

## How It Works

```plaintext
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Your Phone    │────▶│  CrabCallr      │────▶│   Your         │
│   or Browser    │◀────│  Service        │◀────│   OpenClaw     │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │                       │
        │  Audio/WebRTC         │  WebSocket            │  Messages
        │                       │                       │
    You speak             Transcribed text        OpenClaw responds
    You hear              Response audio          via this plugin
```

1. You speak into your phone or browser
2. CrabCallr transcribes your speech in real-time (Deepgram)
3. The transcript is sent to your OpenClaw via this plugin
4. OpenClaw processes your request and generates a response
5. The response is sent back to CrabCallr
6. CrabCallr converts the response to speech (ElevenLabs)
7. You hear the response

## Voice Skill

This plugin includes a voice skill that automatically adapts OpenClaw's responses for spoken conversation:

- Concise, conversational responses (1-3 sentences)
- No bullet points, markdown, or code blocks
- Natural speech patterns with contractions
- Graceful handling of interruptions

The skill is automatically loaded when the plugin is enabled.

## Pricing

- **Free tier** - 30 min/month browser calling via WebRTC
- **Basic tier** ($5/month) - 120 min browser + 30 min phone calling, $0.15/minute overage

See [crabcallr.com](https://crabcallr.com) for current pricing.

## Troubleshooting

### Plugin won't connect

- Verify your API key is correct (should start with `cc_`)
- Check that your OpenClaw Gateway can reach `ws.crabcallr.com`
- Run `openclaw channels status --probe` to see connection details

### No response from assistant

- Ensure your OpenClaw agent is configured and working
- Check OpenClaw logs for errors processing messages

### Poor audio quality

- Use a quiet environment or headphones
- Browser calling typically has better quality than phone

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Watch mode
npm run dev
```

## License

MIT
