# CallClawd Plugin for ClawdBot

Talk to your ClawdBot assistant via phone or browser with CallClawd.

## Overview

CallClawd is a voice interface that lets you have natural conversations with your ClawdBot assistant. This plugin connects your ClawdBot instance to the CallClawd hosted service, enabling:

- **Browser calling** - Talk to ClawdBot from any web browser via WebRTC
- **Phone calling** - Call a phone number to reach your assistant (Pro tier)
- **Streaming speech recognition** - Real-time transcription with Deepgram
- **Natural voice responses** - High-quality text-to-speech with ElevenLabs
- **Barge-in support** - Interrupt the assistant mid-response

## Installation

```bash
clawdbot plugins install @wooters/callclawd-plugin
```

## Setup

1. **Get an API key** - Sign up at [app.callclawd.com](https://app.callclawd.com) and generate an API key

2. **Configure the plugin** - Add to your `~/.clawdbot/clawdbot.json`:

```json
{
  "plugins": {
    "entries": {
      "callclawd": {
        "enabled": true,
        "config": {
          "apiKey": "cc_your_api_key_here"
        }
      }
    }
  }
}
```

3. **Restart ClawdBot Gateway** - The plugin will automatically connect to the CallClawd service

4. **Start calling** - Visit [app.callclawd.com](https://app.callclawd.com) and click "Call" to talk to your assistant

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `apiKey` | string | (required) | Your CallClawd API key |
| `serviceUrl` | string | `wss://api.callclawd.com/ws` | WebSocket URL for the service |
| `autoConnect` | boolean | `true` | Connect automatically on startup |
| `reconnectInterval` | number | `5000` | Reconnection interval in ms |
| `maxReconnectAttempts` | number | `10` | Max reconnect attempts (0 = unlimited) |

## CLI Commands

Check connection status:
```bash
clawdbot callclawd status
```

Manually connect/disconnect:
```bash
clawdbot callclawd connect
clawdbot callclawd disconnect
```

## How It Works

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Your Phone    │────▶│  CallClawd      │────▶│   Your         │
│   or Browser    │◀────│  Service        │◀────│   ClawdBot     │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │                       │
        │  Audio/WebRTC         │  WebSocket            │  Messages
        │                       │                       │
    You speak             Transcribed text        ClawdBot responds
    You hear              Response audio          via this plugin
```

1. You speak into your phone or browser
2. CallClawd transcribes your speech in real-time (Deepgram)
3. The transcript is sent to your ClawdBot via this plugin
4. ClawdBot processes your request and generates a response
5. The response is sent back to CallClawd
6. CallClawd converts the response to speech (ElevenLabs)
7. You hear the response

## Voice Skill

This plugin includes a voice skill that automatically adapts ClawdBot's responses for spoken conversation:

- Concise, conversational responses (1-3 sentences)
- No bullet points, markdown, or code blocks
- Natural speech patterns with contractions
- Graceful handling of interruptions

The skill is automatically loaded when the plugin is enabled.

## Pricing

- **Free tier** - Browser calling via WebRTC
- **Pro tier** ($15/month) - Phone calling with 60 minutes included, $0.10/minute overage

See [callclawd.com](https://callclawd.com) for current pricing.

## Troubleshooting

**Plugin won't connect**
- Verify your API key is correct (should start with `cc_`)
- Check that your ClawdBot Gateway can reach `api.callclawd.com`
- Run `clawdbot callclawd status` to see connection details

**No response from assistant**
- Ensure your ClawdBot agent is configured and working
- Check ClawdBot logs for errors processing messages

**Poor audio quality**
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
