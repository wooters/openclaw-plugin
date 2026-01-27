# CallMolt Plugin for MoltBot

Talk to your MoltBot assistant via phone or browser with CallMolt.

## Overview

CallMolt is a voice interface that lets you have natural conversations with your MoltBot assistant. This plugin connects your MoltBot instance to the CallMolt hosted service, enabling:

- **Browser calling** - Talk to MoltBot from any web browser via WebRTC
- **Phone calling** - Call a phone number to reach your assistant (Pro tier)
- **Streaming speech recognition** - Real-time transcription with Deepgram
- **Natural voice responses** - High-quality text-to-speech with ElevenLabs
- **Barge-in support** - Interrupt the assistant mid-response

## Installation

```bash
moltbot plugins install @wooters/callmolt-plugin
```

## Setup

1. **Get an API key** - Sign up at [app.callmolt.com](https://app.callmolt.com) and generate an API key

2. **Configure the plugin** - Add to your `~/.moltbot/moltbot.json`:

    ```json
    {
      "plugins": {
        "entries": {
          "callmolt": {
            "enabled": true,
            "config": {
              "apiKey": "cc_your_api_key_here"
            }
          }
        }
      }
    }
    ```

3. **Restart MoltBot Gateway** - The plugin will automatically connect to the CallMolt service

4. **Start calling** - Visit [app.callmolt.com](https://app.callmolt.com) and click "Call" to talk to your assistant

## Configuration Options

| Option                 | Type    | Default                      | Description                            |
| ---------------------- | ------- | ---------------------------- | -------------------------------------- |
| `apiKey`               | string  | (required)                   | Your CallMolt API key                 |
| `serviceUrl`           | string  | `wss://api.callmolt.com/ws` | WebSocket URL for the service          |
| `autoConnect`          | boolean | `true`                       | Connect automatically on startup       |
| `reconnectInterval`    | number  | `5000`                       | Reconnection interval in ms            |
| `maxReconnectAttempts` | number  | `10`                         | Max reconnect attempts (0 = unlimited) |

## CLI Commands

Check connection status:

```bash
moltbot callmolt status
```

Manually connect/disconnect:

```bash
moltbot callmolt connect
moltbot callmolt disconnect
```

## How It Works

```plaintext
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Your Phone    │────▶│  CallMolt       │────▶│   Your         │
│   or Browser    │◀────│  Service        │◀────│   MoltBot      │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │                       │
        │  Audio/WebRTC         │  WebSocket            │  Messages
        │                       │                       │
    You speak             Transcribed text        MoltBot responds
    You hear              Response audio          via this plugin
```

1. You speak into your phone or browser
2. CallMolt transcribes your speech in real-time (Deepgram)
3. The transcript is sent to your MoltBot via this plugin
4. MoltBot processes your request and generates a response
5. The response is sent back to CallMolt
6. CallMolt converts the response to speech (ElevenLabs)
7. You hear the response

## Voice Skill

This plugin includes a voice skill that automatically adapts MoltBot's responses for spoken conversation:

- Concise, conversational responses (1-3 sentences)
- No bullet points, markdown, or code blocks
- Natural speech patterns with contractions
- Graceful handling of interruptions

The skill is automatically loaded when the plugin is enabled.

## Pricing

- **Free tier** - Browser calling via WebRTC
- **Pro tier** ($15/month) - Phone calling with 60 minutes included, $0.10/minute overage

See [callmolt.com](https://callmolt.com) for current pricing.

## Troubleshooting

### Plugin won't connect

- Verify your API key is correct (should start with `cc_`)
- Check that your MoltBot Gateway can reach `api.callmolt.com`
- Run `moltbot callmolt status` to see connection details

### No response from assistant

- Ensure your MoltBot agent is configured and working
- Check MoltBot logs for errors processing messages

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
