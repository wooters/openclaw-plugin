# CrabCallr - MVP Design

**Date:** 2026-01-26
**Status:** Draft
**Author:** Chuck / Claude brainstorm session
**Domain:** crabcallr.com

## Overview

CrabCallr is a voice interface that lets OpenClaw users talk to their AI assistant via phone calls or browser. The product extends Updaytr's voice agent expertise to the OpenClaw ecosystem.

**Business model:** Open-source the OpenClaw skill; monetize the hosted telephony service.

## Competitive Analysis: OpenClaw's Existing Voice Capabilities

OpenClaw already has three voice-related features. Understanding their limitations reveals our opportunity.

### 1. Voice-Call Plugin

The voice-call plugin provides phone calling via Twilio, Telnyx, or Plivo. It supports outbound notifications (one-way messages) and multi-turn conversations, plus inbound calls with an allowlist policy.

**How inbound ASR works:** The plugin uses each provider's *native* speech recognition, not a dedicated ASR service. For Twilio, this means the `<Gather>` TwiML verb:

```
User speaks → Twilio detects silence → Twilio's ASR returns text → OpenClaw responds → TTS plays
```

This is turn-based, not streaming. The system waits for the user to stop speaking before processing.

**Key limitations:**
- **User manages infrastructure:** Requires user's own Twilio account, phone number, and publicly reachable webhook URL
- **Turn-based ASR:** No real-time streaming; waits for pause in speech
- **Limited barge-in:** Can't interrupt TTS mid-playback without Media Streams
- **Basic VAD:** Uses provider's silence detection, not sophisticated voice activity detection
- **ElevenLabs buggy:** GitHub issue #1698 (2026-01-25) notes ElevenLabs TTS falls back to robot voice

### 2. Talk Mode (Companion Apps)

Continuous voice conversation for macOS/iOS/Android companion apps. The companion app connects to the OpenClaw Gateway via WebSocket (works locally or remotely via Tailscale/SSH tunnel).

**How it works:**
- ASR runs locally on the device (Apple Speech Recognition)
- On silence detection, transcript is sent to Gateway as text
- Gateway calls the LLM, returns response text
- TTS runs locally on the device (calls ElevenLabs API directly)
- Audio plays through device speakers

**Barge-in support:** Talk Mode does support interruption — if you speak while TTS is playing, playback stops immediately and your new speech is captured. However, it's not *streaming* ASR: the system still waits for you to finish speaking (silence detection) before sending the transcript.

**Key limitations:**
- **Requires companion app:** Must install macOS menu bar app or iOS/Android app
- **Not phone-based:** Can't call from a landline, car, or any phone
- **Setup complexity for remote use:** To use away from home, users must configure Tailscale, SSH tunnels, or expose the Gateway publicly
- **Silence-based turn detection:** No streaming interim results; waits for pause before processing
- **Platform-specific ASR:** Uses Apple Speech Recognition (not available on Windows/Linux)

### 3. Voice Wake

Wake word detection ("Hey Molt") using Apple's speech recognizer. Triggers Talk Mode. Only available on Apple platforms.

### The Gap We Fill

| Capability | Voice-Call Plugin | Talk Mode | Our Product |
|------------|-------------------|-----------|-------------|
| Browser WebRTC calling | ❌ | ❌ | ✅ Free tier |
| Phone calling | ✅ (user manages) | ❌ | ✅ We handle it |
| Works without app install | ❌ Needs webhooks | ❌ Needs companion app | ✅ Browser or phone |
| Setup complexity | High | Medium | Low |
| ASR approach | Turn-based `<Gather>` | Silence-based (Apple) | Streaming (Deepgram) |
| Streaming interim results | ❌ | ❌ | ✅ |
| Barge-in stops TTS | ❌ Limited | ✅ Yes | ✅ Yes |
| Can act on partial speech | ❌ | ❌ | ✅ |
| VAD sophistication | Provider's basic | Apple's silence detection | Deepgram's advanced |
| Noise suppression | ❌ | ❌ | ✅ Krisp |
| ElevenLabs reliability | Buggy | ✅ Works | ✅ Works |

**Bottom line:** Talk Mode is decent for local voice chat with barge-in support, but requires a companion app and still uses silence-based turn detection. The voice-call plugin feels like a traditional IVR. We're building a modern conversational AI experience with streaming ASR, faster perceived response times, and zero-config setup that works from any browser or phone.

## Product Tiers

### Free Tier
- Browser-based calling via WebRTC
- Voice selection from curated list (5-10 ElevenLabs voices)
- No phone number required

### Basic Tier ($5/month)
- Everything in Free
- Inbound phone calling via shared Twilio number
- Caller ID routing (no PIN required)
- 60 minutes included
- $0.10/minute overage

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Your Hosted Service                       │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐  │
│  │   Twilio    │    │   LiveKit   │    │   Voice Pipeline    │  │
│  │  (Phone)    │───▶│   Agents    │───▶│  - Deepgram STT     │  │
│  └─────────────┘    │   Server    │    │  - ElevenLabs TTS   │  │
│                     │             │    │  - Krisp (noise)    │  │
│  ┌─────────────┐    │             │    │  - VAD + Barge-in   │  │
│  │  Browser    │───▶│             │    └─────────────────────┘  │
│  │  (WebRTC)   │    └──────┬──────┘                              │
│  └─────────────┘           │                                     │
│                            │ websocket                           │
│  ┌─────────────┐           │                                     │
│  │   Web UI    │           │                                     │
│  │ app.crabcallr.com   │           │                                     │
│  └─────────────┘           │                                     │
└────────────────────────────┼────────────────────────────────────┘
                             │
                             ▼
┌────────────────────────────────────────────────────────────────┐
│                    User's Machine                               │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                     OpenClaw                             │   │
│  │  ┌─────────────────────────────────────────────────┐    │   │
│  │  │           Voice Skill (open source)             │    │   │
│  │  │  - Establishes outbound websocket to service    │    │   │
│  │  │  - Receives text, sends to OpenClaw             │    │   │
│  │  │  - Returns OpenClaw response as text            │    │   │
│  │  └─────────────────────────────────────────────────┘    │   │
│  └─────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────┘
```

## Data Flow

### Inbound Phone Call (Basic)
1. User calls shared Twilio number
2. Twilio matches caller ID to registered user
3. Twilio routes call to LiveKit via SIP
4. LiveKit Agent joins the session
5. Audio streams through pipeline: Krisp → Deepgram STT → text
6. Text sent via websocket to user's OpenClaw skill
7. OpenClaw processes, returns response text
8. Text sent to ElevenLabs TTS → audio streamed back to caller
9. Barge-in: if user speaks mid-response, pipeline interrupts TTS

### Browser Call (Free)
1. User opens app.crabcallr.com, logs in
2. User selects voice, clicks "Call"
3. Browser connects to LiveKit room via WebRTC
4. LiveKit Agent joins the room
5. Same pipeline as phone: Krisp → Deepgram → OpenClaw → ElevenLabs
6. Audio streamed back via WebRTC

## Components

### OpenClaw Skill (Open Source)
- Installed by user in their OpenClaw instance
- On startup, establishes outbound websocket to hosted service
- Authenticates with API key (generated during web UI signup)
- Receives transcribed user speech as text
- Passes text to OpenClaw's message handling
- Returns OpenClaw's response as text
- Stateless from the skill's perspective; OpenClaw manages context

### Hosted Service
- **LiveKit Agents server:** Handles WebRTC and Twilio SIP connections
- **Voice pipeline:** Deepgram (STT + VAD), ElevenLabs (TTS), Krisp (noise)
- **Websocket manager:** Maintains connections to OpenClaw skills
- **User database:** Accounts, phone numbers, voice preferences, usage tracking
- **Billing integration:** Stripe for Basic subscriptions and overage

### Web UI (app.crabcallr.com)
- **Auth:** Login/signup, API key generation for skill
- **Call interface:** "Call" button, call status, end call
- **Voice picker:** 5-10 curated ElevenLabs voices with preview
- **Settings:** Registered phone number (Basic), account management
- **Usage dashboard:** Minutes used, billing info (Basic)

## Voice Pipeline Details

### Speech-to-Text: Deepgram
- Streaming transcription
- Built-in VAD (voice activity detection)
- Interim results for faster perceived response
- Model: nova-2 or latest recommended

### Text-to-Speech: ElevenLabs
- Streaming audio output
- 5-10 curated voices (mix of genders, accents, styles)
- eleven_turbo_v2 for low latency
- Startup grant: 33M tokens available

### Noise Suppression: Krisp
- Applied to inbound audio before STT
- Critical for phone calls in noisy environments

### Barge-in Handling
- LiveKit Agents provides turn-taking abstractions
- When VAD detects user speech during TTS playback:
  - Immediately stop TTS audio
  - Cancel pending TTS generation
  - Process new user input
- Prevents the "talking over each other" problem

## Phone Number Management

### Shared Number with Caller ID Routing
- Single Twilio number for all users
- User registers their phone number(s) during Basic signup
- Inbound call: lookup caller ID → find websocket → route call
- No PIN or voice authentication required

### MVP Constraints
- One registered phone number per user
- No outbound calling
- No dedicated numbers

### Future Expansion
- Multiple numbers per user ("call my mobile" vs "call my office")
- Dedicated phone numbers (premium feature)
- Outbound calling (OpenClaw initiates calls)
- Contact list (call others on user's behalf)

## User Onboarding Flow

1. User discovers product (OpenClaw community, Updaytr marketing)
2. Signs up at app.crabcallr.com
3. Receives API key
4. Installs OpenClaw skill, configures with API key
5. Skill connects to hosted service
6. User opens web UI, selects voice, clicks "Call"
7. Free tier active; user can talk to OpenClaw via browser
8. To upgrade: enters phone number, subscribes via Stripe
9. Basic tier active; user can now call from their phone

## Error Handling

### OpenClaw Disconnected
- If websocket to OpenClaw skill drops during call:
  - Play message: "Your assistant is temporarily unavailable"
  - Attempt reconnect for 10 seconds
  - If still disconnected, end call gracefully

### OpenClaw Timeout
- If OpenClaw takes >10 seconds to respond:
  - Play filler: "Let me think about that..."
  - Continue waiting up to 30 seconds
  - If still no response, apologize and end call

### Unrecognized Caller (Phone)
- Caller ID not in database:
  - Play message: "This number isn't registered. Visit [url] to set up your account."
  - End call

### Service Overload
- If too many concurrent calls:
  - Free tier: "All lines are busy, please try again later"
  - Basic tier: Prioritize, queue briefly, then same message

## MVP Scope Summary

### In Scope
- Browser calling via WebRTC (Free tier)
- Inbound phone calling via shared Twilio number (Basic tier)
- Caller ID routing
- LiveKit Agents for realtime audio
- Deepgram STT with VAD
- ElevenLabs TTS (5-10 curated voices)
- Krisp noise suppression
- Barge-in support
- Web UI: auth, call button, voice picker, settings
- OpenClaw skill (open source)
- Stripe billing for Basic tier

### Out of Scope (Future)
- Outbound calling
- Multiple phone numbers per user
- Dedicated phone numbers
- Contact list / calling others
- Full ElevenLabs voice library
- Custom/cloned voices
- Mobile app

## Open Questions

1. **OpenClaw integration:** Does the skill architecture align with how OpenClaw skills work? May need to review OpenClaw docs.
2. **Krisp integration:** Verify Krisp works with LiveKit pipeline or if alternative needed.

## Repository Structure

Three repositories to separate concerns and enable reuse:

### crabcallr-plugin (Public)

OpenClaw plugin + skill in one package. The plugin handles the websocket connection to the CrabCallr service; the skill provides voice-optimized prompting so OpenClaw responds appropriately for spoken conversation.

```
github.com/wooters/crabcallr-plugin/
├── openclaw.plugin.json       # Plugin manifest
├── package.json               # npm package config
├── src/
│   ├── index.ts               # Plugin entry point
│   ├── websocket.ts           # Connection to CrabCallr service
│   ├── config.ts              # Configuration handling
│   └── types.ts
├── skills/
│   └── crabcallr/
│       └── SKILL.md           # Voice-optimized prompting instructions
├── README.md
└── tsconfig.json
```

**Plugin responsibilities:**
- Establishes websocket connection to CrabCallr hosted service
- Registers tools for the agent (e.g., connection status)
- Routes incoming transcribed text to OpenClaw's agent
- Sends OpenClaw's responses back to the service
- Registers CLI commands (`openclaw crabcallr status`)

**Skill responsibilities:**
- Instructs the AI to be concise and conversational
- Avoids bullet points, markdown, code blocks in voice responses
- Uses natural speech patterns
- Handles barge-in gracefully
- Loaded automatically when plugin is enabled

### livekit-voice-agent (Public or Private)

Reusable LiveKit voice agent pipeline. Can be used by CrabCallr, Updaytr, or future projects.

```
github.com/wooters/livekit-voice-agent/
├── src/
│   ├── agent.py               # LiveKit Agent entry point
│   ├── pipeline.py            # Deepgram STT + ElevenLabs TTS + Krisp
│   ├── stt.py                 # Deepgram wrapper
│   ├── tts.py                 # ElevenLabs wrapper
│   ├── vad.py                 # Voice activity detection
│   └── types.py
├── examples/
│   ├── simple_agent.py
│   └── with_backend.py
├── Dockerfile
├── requirements.txt
├── pyproject.toml
└── README.md
```

### crabcallr (Private)

Web UI, API backend, and infrastructure. Consumes the voice agent as a dependency and manages the websocket connections to OpenClaw plugins.

```
github.com/wooters/crabcallr/
├── api/
│   ├── main.py                # FastAPI app
│   ├── auth.py                # Authentication
│   ├── users.py               # User management
│   ├── billing.py             # Stripe integration
│   ├── openclaw_ws.py         # WebSocket manager for plugin connections
│   └── db.py                  # Supabase client
├── web/
│   ├── src/
│   ├── package.json
│   └── astro.config.mjs
├── agent/
│   ├── main.py                # Thin wrapper that imports livekit-voice-agent
│   └── router.py              # Routes audio <-> OpenClaw plugin websockets
├── infra/
│   ├── docker-compose.yml
│   └── Dockerfile
├── .env.example
└── README.md
```

## Plugin + Skill Details

### Why Both Are Needed

| Component | Purpose |
|-----------|---------|
| **Plugin** | Runtime code that connects OpenClaw Gateway to CrabCallr service |
| **Skill** | Prompting instructions that adapt AI responses for voice |

The plugin handles the *mechanics* (websocket, routing). The skill handles the *behavior* (how the AI should respond when in a voice call).

### Example Skill Content (skills/crabcallr/SKILL.md)

```markdown
---
name: crabcallr
description: Voice interface for OpenClaw - adapts responses for spoken conversation
metadata: {"openclaw":{"requires":{"config":["plugins.entries.crabcallr.enabled"]}}}
---

# CrabCallr Voice Mode

You are currently in a voice conversation via CrabCallr. Adapt your responses for speech:

## Response Style
- Keep responses brief and conversational (1-3 sentences ideal)
- Avoid bullet points, numbered lists, and markdown formatting
- Don't read URLs, code blocks, or technical syntax aloud
- Use natural speech patterns with contractions
- If asked for something long, offer to send it via text instead

## Interaction Patterns
- Acknowledge you heard the user before diving into complex answers
- Ask clarifying questions one at a time
- If interrupted, acknowledge and pivot gracefully

## What NOT to do
- Don't say "Here's a bulleted list..."
- Don't read out formatting characters
- Don't give paragraph-length explanations unless asked
```

### Plugin Manifest (openclaw.plugin.json)

```json
{
  "id": "crabcallr",
  "name": "CrabCallr Voice Interface",
  "version": "0.1.0",
  "description": "Talk to OpenClaw via phone or browser",
  "entry": "./src/index.ts",
  "skills": ["./skills"],
  "configSchema": {
    "type": "object",
    "properties": {
      "apiKey": { "type": "string" },
      "serviceUrl": { "type": "string", "default": "wss://api.crabcallr.com/ws" }
    },
    "required": ["apiKey"]
  },
  "uiHints": {
    "apiKey": { "label": "CrabCallr API Key", "sensitive": true },
    "serviceUrl": { "label": "Service URL" }
  }
}
```

### Installation Flow

1. User signs up at app.crabcallr.com, gets API key
2. User installs plugin: `openclaw plugins install @wooters/crabcallr-plugin`
3. User configures in `~/.openclaw/openclaw.json`:
   ```json
   {
     "plugins": {
       "entries": {
         "crabcallr": {
           "enabled": true,
           "config": {
             "apiKey": "their-api-key"
           }
         }
       }
     }
   }
   ```
4. User restarts Gateway
5. Plugin connects to CrabCallr service, skill loads automatically
6. User can now call via phone or browser

## Deployment Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     LiveKit Cloud                            │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐      │
│  │   Twilio    │───▶│   LiveKit   │◄───│   Browser   │      │
│  │  SIP Trunk  │    │   Server    │    │   WebRTC    │      │
│  └─────────────┘    └──────┬──────┘    └─────────────┘      │
│                            │                                 │
└────────────────────────────┼────────────────────────────────┘
                             │ WebSocket (participant)
                             ▼
┌────────────────────────────────────────────────────────────┐
│               Railway / Fly.io                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │         CrabCallr Agent (uses livekit-voice-agent)   │   │
│  │  - Deepgram STT                                      │   │
│  │  - ElevenLabs TTS                                    │   │
│  │  - Krisp noise suppression                           │   │
│  │  - WebSocket to OpenClaw skills                      │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              API Server (Python/Node)                │   │
│  │  - Auth, user management                             │   │
│  │  - Stripe billing                                    │   │
│  │  - Phone number registration                         │   │
│  └─────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────┘
```

### Deployment Providers by Component

| Component | Provider | Notes |
|-----------|----------|-------|
| Web UI | Cloudflare Pages | Static site, deploys from `web/` subdirectory |
| API Server | Railway or Fly.io | REST API for auth, billing, settings |
| CrabCallr Agent | Railway or Fly.io | Persistent process, not serverless |
| LiveKit Server | LiveKit Cloud | Managed SFU, handles WebRTC/SIP |
| Database | Supabase | User accounts, phone mappings, usage tracking |
| Billing | Stripe | Subscriptions and metered usage |
| Phone Numbers | Twilio | SIP trunk connected to LiveKit Cloud |

### Why LiveKit Cloud for MVP

- Eliminates ops burden of running LiveKit Server
- Built-in SIP integration for Twilio
- Global edge network for low-latency media
- Auto-scaling for rooms and participants
- Can self-host later if costs become significant

### Cloudflare Pages Configuration

For monorepo deployment from the `crabcallr` repo:

| Setting | Value |
|---------|-------|
| Repository | `github.com/wooters/crabcallr` |
| Root directory | `web` |
| Build command | `npm run build` |
| Build output | `dist` |

### Web Framework: Astro (Recommended for SEO)

**Why Astro for Cloudflare Pages + SEO:**

| Requirement | Astro Solution |
|-------------|----------------|
| SEO / Crawlability | Static HTML by default — bots see full content, no JS required |
| Cloudflare Pages | First-class support, zero-config deployment |
| Performance | Ships zero JS unless you need it ("islands" architecture) |
| Flexibility | Use React/Vue/Svelte components where needed (dashboard, call UI) |
| Content | Built-in Markdown/MDX for docs, blog posts |

**Astro vs alternatives:**

| Framework | SSR on Cloudflare | SEO | Complexity |
|-----------|-------------------|-----|------------|
| **Astro** | ✅ Native | ✅ Static HTML | Low |
| Next.js | ⚠️ Requires @cloudflare/next-on-pages | ✅ With SSR | Medium |
| Nuxt | ⚠️ Requires nitro preset | ✅ With SSR | Medium |
| SvelteKit | ✅ Native adapter | ✅ With SSR | Low |
| Plain React (Vite) | N/A (SPA) | ❌ Poor | Low |

**Recommended Astro setup:**

```
web/
├── src/
│   ├── pages/
│   │   ├── index.astro        # Landing page (static)
│   │   ├── pricing.astro      # Pricing page (static)
│   │   ├── docs/[...slug].astro  # Docs from Markdown
│   │   └── app/
│   │       ├── index.astro    # Dashboard shell
│   │       └── call.astro     # Call UI (React island)
│   ├── components/
│   │   ├── Header.astro
│   │   ├── CallButton.tsx     # React component for interactivity
│   │   └── VoicePicker.tsx
│   ├── content/
│   │   └── docs/              # Markdown docs
│   └── layouts/
│       └── Base.astro
├── astro.config.mjs
├── package.json
└── tailwind.config.js
```

**Key patterns:**
- Marketing pages (/, /pricing, /docs) → Pure Astro (static HTML, great SEO)
- App pages (/app/call) → Astro page with React "islands" for interactivity
- Auth → Handled via API, not SSR (keeps Pages deployment simple)

## Success Metrics

- **Adoption:** Number of OpenClaw users who install the skill
- **Activation:** % who make at least one call
- **Conversion:** % of Free users who upgrade to Basic
- **Retention:** Monthly active callers
- **Usage:** Average minutes per user per month
- **NPS:** User satisfaction with call quality

## Next Steps

1. Register crabcallr.com domain
2. Create GitHub repos: crabcallr-plugin, livekit-voice-agent, crabcallr
3. Prototype LiveKit + Deepgram + ElevenLabs pipeline in livekit-voice-agent
4. Build minimal OpenClaw plugin with voice skill
5. Test end-to-end with a single user
6. Build web UI
7. Alpha launch to OpenClaw community
