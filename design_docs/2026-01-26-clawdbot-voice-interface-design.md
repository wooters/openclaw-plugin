# ClawdBot Voice Interface - MVP Design

**Date:** 2026-01-26  
**Status:** Draft  
**Author:** Chuck / Claude brainstorm session

## Overview

A voice interface that lets ClawdBot users talk to their AI assistant via phone calls or browser. The product extends Updaytr's voice agent expertise to the ClawdBot ecosystem.

**Business model:** Open-source the ClawdBot skill; monetize the hosted telephony service.

## Competitive Analysis: ClawdBot's Existing Voice Capabilities

ClawdBot already has three voice-related features. Understanding their limitations reveals our opportunity.

### 1. Voice-Call Plugin

The voice-call plugin provides phone calling via Twilio, Telnyx, or Plivo. It supports outbound notifications (one-way messages) and multi-turn conversations, plus inbound calls with an allowlist policy.

**How inbound ASR works:** The plugin uses each provider's *native* speech recognition, not a dedicated ASR service. For Twilio, this means the `<Gather>` TwiML verb:

```
User speaks → Twilio detects silence → Twilio's ASR returns text → ClawdBot responds → TTS plays
```

This is turn-based, not streaming. The system waits for the user to stop speaking before processing.

**Key limitations:**
- **User manages infrastructure:** Requires user's own Twilio account, phone number, and publicly reachable webhook URL
- **Turn-based ASR:** No real-time streaming; waits for pause in speech
- **Limited barge-in:** Can't interrupt TTS mid-playback without Media Streams
- **Basic VAD:** Uses provider's silence detection, not sophisticated voice activity detection
- **ElevenLabs buggy:** GitHub issue #1698 (2026-01-25) notes ElevenLabs TTS falls back to robot voice

### 2. Talk Mode (Companion Apps)

Continuous voice conversation for macOS/iOS/Android companion apps. The companion app connects to the ClawdBot Gateway via WebSocket (works locally or remotely via Tailscale/SSH tunnel).

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

Wake word detection ("Hey Clawd") using Apple's speech recognizer. Triggers Talk Mode. Only available on Apple platforms.

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

### Pro Tier ($15/month)
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
│  │ app.*.com   │           │                                     │
│  └─────────────┘           │                                     │
└────────────────────────────┼────────────────────────────────────┘
                             │
                             ▼
┌────────────────────────────────────────────────────────────────┐
│                    User's Machine                               │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                     ClawdBot                             │   │
│  │  ┌─────────────────────────────────────────────────┐    │   │
│  │  │           Voice Skill (open source)             │    │   │
│  │  │  - Establishes outbound websocket to service    │    │   │
│  │  │  - Receives text, sends to ClawdBot             │    │   │
│  │  │  - Returns ClawdBot response as text            │    │   │
│  │  └─────────────────────────────────────────────────┘    │   │
│  └─────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────┘
```

## Data Flow

### Inbound Phone Call (Pro)
1. User calls shared Twilio number
2. Twilio matches caller ID to registered user
3. Twilio routes call to LiveKit via SIP
4. LiveKit Agent joins the session
5. Audio streams through pipeline: Krisp → Deepgram STT → text
6. Text sent via websocket to user's ClawdBot skill
7. ClawdBot processes, returns response text
8. Text sent to ElevenLabs TTS → audio streamed back to caller
9. Barge-in: if user speaks mid-response, pipeline interrupts TTS

### Browser Call (Free)
1. User opens app.*.com, logs in
2. User selects voice, clicks "Call"
3. Browser connects to LiveKit room via WebRTC
4. LiveKit Agent joins the room
5. Same pipeline as phone: Krisp → Deepgram → ClawdBot → ElevenLabs
6. Audio streamed back via WebRTC

## Components

### ClawdBot Skill (Open Source)
- Installed by user in their ClawdBot instance
- On startup, establishes outbound websocket to hosted service
- Authenticates with API key (generated during web UI signup)
- Receives transcribed user speech as text
- Passes text to ClawdBot's message handling
- Returns ClawdBot's response as text
- Stateless from the skill's perspective; ClawdBot manages context

### Hosted Service
- **LiveKit Agents server:** Handles WebRTC and Twilio SIP connections
- **Voice pipeline:** Deepgram (STT + VAD), ElevenLabs (TTS), Krisp (noise)
- **Websocket manager:** Maintains connections to ClawdBot skills
- **User database:** Accounts, phone numbers, voice preferences, usage tracking
- **Billing integration:** Stripe for Pro subscriptions and overage

### Web UI (app.*.com)
- **Auth:** Login/signup, API key generation for skill
- **Call interface:** "Call" button, call status, end call
- **Voice picker:** 5-10 curated ElevenLabs voices with preview
- **Settings:** Registered phone number (Pro), account management
- **Usage dashboard:** Minutes used, billing info (Pro)

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
- User registers their phone number(s) during Pro signup
- Inbound call: lookup caller ID → find websocket → route call
- No PIN or voice authentication required

### MVP Constraints
- One registered phone number per user
- No outbound calling
- No dedicated numbers

### Future Expansion
- Multiple numbers per user ("call my mobile" vs "call my office")
- Dedicated phone numbers (premium feature)
- Outbound calling (ClawdBot initiates calls)
- Contact list (call others on user's behalf)

## User Onboarding Flow

1. User discovers product (ClawdBot community, Updaytr marketing)
2. Signs up at app.*.com
3. Receives API key
4. Installs ClawdBot skill, configures with API key
5. Skill connects to hosted service
6. User opens web UI, selects voice, clicks "Call"
7. Free tier active; user can talk to ClawdBot via browser
8. To upgrade: enters phone number, subscribes via Stripe
9. Pro tier active; user can now call from their phone

## Error Handling

### ClawdBot Disconnected
- If websocket to ClawdBot skill drops during call:
  - Play message: "Your assistant is temporarily unavailable"
  - Attempt reconnect for 10 seconds
  - If still disconnected, end call gracefully

### ClawdBot Timeout
- If ClawdBot takes >10 seconds to respond:
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
  - Pro tier: Prioritize, queue briefly, then same message

## MVP Scope Summary

### In Scope
- Browser calling via WebRTC (Free tier)
- Inbound phone calling via shared Twilio number (Pro tier)
- Caller ID routing
- LiveKit Agents for realtime audio
- Deepgram STT with VAD
- ElevenLabs TTS (5-10 curated voices)
- Krisp noise suppression
- Barge-in support
- Web UI: auth, call button, voice picker, settings
- ClawdBot skill (open source)
- Stripe billing for Pro tier

### Out of Scope (Future)
- Outbound calling
- Multiple phone numbers per user
- Dedicated phone numbers
- Contact list / calling others
- Full ElevenLabs voice library
- Custom/cloned voices
- Mobile app

## Open Questions

1. **Product name:** Pagerr? Pingr? Buzzr? Need to verify domain availability.
2. **ClawdBot integration:** Does the skill architecture align with how ClawdBot skills work? May need to review ClawdBot docs.
3. **Krisp integration:** Verify Krisp works with LiveKit pipeline or if alternative needed.

## Repository Structure

Two repositories to separate open-source skill from proprietary service:

### voxxr-skill (Public)

Open-source ClawdBot skill, MIT/Apache licensed.

```
github.com/updaytr/voxxr-skill/
├── src/
│   ├── index.ts           # Skill entry point
│   ├── websocket.ts       # Connection to hosted service
│   ├── config.ts          # API key, service URL config
│   └── types.ts
├── SKILL.md               # ClawdBot skill manifest
├── README.md              # Setup instructions
├── package.json
└── tsconfig.json
```

### voxxr (Private)

Proprietary service, web UI, and infrastructure.

```
github.com/updaytr/voxxr/
├── service/
│   ├── agent/             # LiveKit Agent (Python)
│   │   ├── main.py
│   │   ├── pipeline.py    # Deepgram + ElevenLabs + Krisp
│   │   └── clawdbot.py    # WebSocket to skills
│   ├── api/               # REST API for web UI
│   │   ├── auth.py
│   │   ├── users.py
│   │   └── billing.py
│   └── requirements.txt
├── web/
│   ├── src/
│   ├── package.json
│   └── next.config.js
├── infra/
│   ├── docker-compose.yml
│   ├── Dockerfile.agent
│   ├── Dockerfile.api
│   └── terraform/
├── .env.example
└── README.md
```

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
│  │              LiveKit Agent (Python)                  │   │
│  │  - Deepgram STT                                      │   │
│  │  - ElevenLabs TTS                                    │   │
│  │  - Krisp noise suppression                           │   │
│  │  - WebSocket to ClawdBot skills                      │   │
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
| LiveKit Agent | Railway or Fly.io | Persistent process, not serverless |
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

For monorepo deployment:

| Setting | Value |
|---------|-------|
| Repository | `github.com/updaytr/voxxr` |
| Root directory | `web` |
| Build command | `npm run build` |
| Build output | `dist` |

## Success Metrics

- **Adoption:** Number of ClawdBot users who install the skill
- **Activation:** % who make at least one call
- **Conversion:** % of Free users who upgrade to Pro
- **Retention:** Monthly active callers
- **Usage:** Average minutes per user per month
- **NPS:** User satisfaction with call quality

## Next Steps

1. Verify domain availability for product name
2. Prototype LiveKit + Deepgram + ElevenLabs pipeline
3. Build minimal ClawdBot skill
4. Test end-to-end with a single user
5. Build web UI
6. Alpha launch to ClawdBot community
