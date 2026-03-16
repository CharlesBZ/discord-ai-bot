# 🔥 Ember AI — Discord Voice Bot

A fully local, voice-to-voice AI bot for Discord. Ember listens in voice channels, transcribes speech with **Whisper.cpp**, generates replies with **Ollama**, speaks back with **Piper TTS**, and remembers conversations across calls.

No cloud APIs. Everything runs on your machine.

---

## How it works

```
You speak in VC
    → Discord sends Opus audio
    → Decoded to 48kHz stereo PCM
    → Downsampled to 16kHz mono
    → Whisper.cpp transcribes to text
    → Ollama generates a reply (with memory context)
    → Piper TTS synthesises speech
    → ffmpeg resamples to 48kHz stereo
    → Ember speaks back in VC
    → Turn saved to memory/guild_<id>.json
```

---

## Stack

| Layer            | Tool                                      |
| ---------------- | ----------------------------------------- |
| Bot framework    | discord.js 14 + @discordjs/voice          |
| Speech-to-text   | Whisper.cpp (ggml-base.en or any model)   |
| Language model   | Ollama (qwen2.5:7b or any local model)    |
| Text-to-speech   | Piper TTS (en_US-amy-medium or any voice) |
| Audio resampling | ffmpeg-static                             |
| E2EE (DAVE)      | @snazzah/davey                            |
| Runtime          | Node.js 20+ / TypeScript via tsx          |

---

## Project structure

```
ember-bot/
├── src/
│   ├── index.ts            # Discord client, slash commands, shutdown
│   ├── config.ts           # Typed env var validation
│   ├── memory.ts           # Persistent per-guild JSON memory
│   ├── ollama.ts           # LLM replies + call summarisation
│   ├── stt.ts              # Whisper transcription + WAV builder
│   ├── tts.ts              # Piper TTS + ffmpeg resample pipeline
│   ├── voice.ts            # Per-guild state, listen pipeline, speak queue
│   ├── deploy-commands.ts  # Slash command registration script
│   └── diagnose.ts         # Full pipeline self-test
├── bin/
│   ├── whisper-cli         # Built whisper.cpp binary
│   └── piper               # Piper TTS binary
├── models/
│   ├── ggml-base.en.bin
│   ├── en_US-amy-medium.onnx
│   └── en_US-amy-medium.onnx.json
├── memory/                 # Auto-created, per-guild JSON files
├── .env
├── .env.example
└── package.json
```

---

## Prerequisites

- Node.js 20+
- [Ollama](https://ollama.com) running locally (`ollama serve`)
- Your chosen model pulled: `ollama pull qwen2.5:7b`
- `build-essential` and `cmake` for building Whisper.cpp

---

## Installation

### 1. Clone and install dependencies

```bash
git clone <your-repo>
cd ember-bot
npm install
```

### 2. Install Whisper.cpp locally

```bash
git clone https://github.com/ggml-org/whisper.cpp.git
cd whisper.cpp
cmake -B build
cmake --build build -j$(nproc) --config Release
cd ..

mkdir -p bin models
cp whisper.cpp/build/bin/whisper-cli ./bin/whisper-cli

bash whisper.cpp/models/download-ggml-model.sh base.en
cp whisper.cpp/models/ggml-base.en.bin ./models/ggml-base.en.bin
```

### 3. Install Piper TTS locally

```bash
# Linux x64
curl -L https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_linux_x86_64.tar.gz \
  | tar -xz -C bin/ --strip-components=1

# Download voice model
wget "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/amy/medium/en_US-amy-medium.onnx?download=true" \
  -O models/en_US-amy-medium.onnx

wget "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/amy/medium/en_US-amy-medium.onnx.json?download=true" \
  -O models/en_US-amy-medium.onnx.json
```

### 4. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
# Discord
DISCORD_TOKEN=your_bot_token
DISCORD_CLIENT_ID=your_application_id
GUILD_ID=your_server_id

# Ollama
OLLAMA_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen2.5:7b

# Whisper
WHISPER_BIN=./bin/whisper-cli
WHISPER_MODEL=./models/ggml-base.en.bin

# Piper
PIPER_BIN=./bin/piper
PIPER_MODEL=./models/en_US-amy-medium.onnx
PIPER_SPEAK_RATE=0.85

# Voice tuning
SILENCE_MS=900
MIN_UTTERANCE_MS=700
COOLDOWN_MS=2000

# Memory
MEMORY_DIR=./memory
```

---

## Discord Developer Portal setup

1. Go to [discord.com/developers/applications](https://discord.com/developers/applications)
2. **New Application** → give it a name
3. **General Information** → copy the **Application ID** → `DISCORD_CLIENT_ID`
4. **Bot** tab:
   - Click **Reset Token** → copy it → `DISCORD_TOKEN`
   - Turn **Public Bot** OFF
   - Enable all three **Privileged Gateway Intents**:
     - ✅ Presence Intent
     - ✅ Server Members Intent
     - ✅ Message Content Intent
5. **OAuth2 → URL Generator**:
   - Scopes: `bot` + `applications.commands`
   - Permissions: `Connect`, `Speak`, `Use Voice Activity`, `Send Messages`, `Read Message History`, `View Channels`
   - Copy the generated URL and open it to invite the bot to your server
6. In Discord: **User Settings → Advanced → Developer Mode ON**
   - Right-click your server → **Copy Server ID** → `GUILD_ID`

---

## Running

### Verify everything works first

```bash
npm run diagnose
```

Tests all 7 layers: env vars, binaries, ffmpeg, Whisper, Piper, Ollama, and Discord token. Fix any failures before proceeding.

### Register slash commands

```bash
# Guild deploy (instant, for development)
npm run deploy

# Global deploy (up to 1 hour, for production)
npm run deploy:global
```

Only needs to be run once, or when commands change.

### Start the bot

```bash
# Development (no compile step)
npm run dev

# Production
npm run build
npm start
```

---

## Slash commands

| Command        | Options            | Description                                         |
| -------------- | ------------------ | --------------------------------------------------- |
| `/join`        | —                  | Ember joins your voice channel and starts listening |
| `/leave`       | —                  | Ember leaves, saves a call recap to memory          |
| `/goodnight`   | `count`, `english` | Multilingual goodnight, spoken + posted in chat     |
| `/memory`      | `turns` (1–30)     | Shows call summary + recent turns (ephemeral)       |
| `/clearmemory` | —                  | Wipes all memory for this server                    |
| `/status`      | —                  | Shows voice state, model paths, connection info     |

You can also **@mention** Ember in any text channel and she'll reply in chat and speak the response in VC if connected.

---

## Memory system

Ember maintains a per-guild JSON file at `memory/guild_<id>.json` containing:

- **`recent_turns`** — last 60 exchanges (user + assistant), with timestamps and usernames
- **`call_summary`** — a 3–6 bullet recap generated by Ollama when `/leave` is called

On `/join`, if a summary exists Ember reads it aloud as a greeting. This gives her continuity across sessions without feeding the full history into every prompt.

Sensitive content (passwords, API keys, tokens) is filtered before storage.

---

## Personality

Ember is configured via the system prompt in `src/ollama.ts`. By default she is:

- Witty, slightly sarcastic, chaotic-friendly
- Keeps replies to 1–4 sentences (optimised for spoken audio)
- Loves robotics, mechatronics, engineering, and coding
- Created by **Charlo** (her father, as far as she's concerned)

Edit `CHARACTER_SYSTEM_PROMPT` in `src/ollama.ts` to customise her personality.

---

## Tuning

| Env var            | Default      | Effect                                                    |
| ------------------ | ------------ | --------------------------------------------------------- |
| `SILENCE_MS`       | `900`        | How long to wait after you stop talking before processing |
| `MIN_UTTERANCE_MS` | `700`        | Ignore clips shorter than this (filters mic noise)        |
| `COOLDOWN_MS`      | `2000`       | Minimum gap between captures per user                     |
| `PIPER_SPEAK_RATE` | `0.85`       | Speech speed (0.6 = slow, 1.0 = normal, 1.6 = fast)       |
| `OLLAMA_MODEL`     | `qwen2.5:7b` | Any model pulled in Ollama                                |

---

## Troubleshooting

**Voice connection stuck at `signalling` or `connecting`**
Discord enforces DAVE (E2EE) on all voice channels as of March 2026. Make sure `@snazzah/davey` is installed:

```bash
npm install @snazzah/davey
node -e "const { generateDependencyReport } = require('@discordjs/voice'); console.log(generateDependencyReport())"
```

The report should show a DAVE Protocol section with a version number.

**No audio playback / Ember speaks but you hear nothing**
Run `npm run diagnose` — specifically check the Piper + ffmpeg pipeline section. The TTS chain requires ffmpeg to resample Piper's output to 48kHz stereo before Discord will play it.

**Transcripts are empty or gibberish**
Whisper needs 16kHz mono PCM. The voice pipeline downsamples Discord's 48kHz stereo automatically — if you're getting garbage, check that `@discordjs/opus` built correctly:

```bash
node -e "require('@discordjs/opus')"
```

If it throws, rebuild: `npm install @discordjs/opus --build-from-source`

**Memory not saving**
Check write permissions on the `./memory` directory. `saveMemory()` now logs errors explicitly — watch the console for `[memory] saveMemory FAILED`.

---

## .gitignore

```gitignore
# Binaries and models (platform-specific / too large for git)
bin/
models/
whisper.cpp/

# Runtime
memory/
dist/
node_modules/
.env
```

---

## License

MIT — built by Charlo / [DARKBLAZE.DEV](https://darkblaze.dev)
