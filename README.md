# 🔥 Ember AI

A fully local voice-to-voice AI bot for Discord. Ember listens in voice channels, transcribes with Whisper.cpp, thinks with Ollama, and talks back with Piper TTS. No cloud APIs, no subscriptions — everything runs on your machine.

## How it works

```
You talk → Whisper.cpp (STT) → Ollama (LLM) → Piper (TTS) → Ember talks back
```

Memory is saved per-server to `memory/guild_<id>.json` and summarised at the end of each call so Ember remembers context across sessions.

## Stack

- **discord.js 14** + **@discordjs/voice** — bot framework
- **Whisper.cpp** — local speech-to-text
- **Ollama** — local LLM inference (default: qwen2.5:7b)
- **Piper TTS** — local text-to-speech
- **ffmpeg-static** — audio resampling (Piper → Discord format)
- **@snazzah/davey** — Discord DAVE E2EE protocol (required as of March 2026)
- **TypeScript** + **tsx** — runtime

## Prerequisites

- Node.js 20+
- `build-essential` and `cmake` (for Whisper.cpp)
- [Ollama](https://ollama.com) running: `ollama serve && ollama pull qwen2.5:7b`

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Build Whisper.cpp

```bash
git clone https://github.com/ggml-org/whisper.cpp.git
cd whisper.cpp && cmake -B build && cmake --build build -j$(nproc) --config Release && cd ..

mkdir -p bin models
cp whisper.cpp/build/bin/whisper-cli ./bin/
bash whisper.cpp/models/download-ggml-model.sh base.en
cp whisper.cpp/models/ggml-base.en.bin ./models/
```

### 3. Install Piper TTS

```bash
# Linux x64
curl -L https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_linux_x86_64.tar.gz \
  | tar -xz -C bin/ --strip-components=1

wget "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/amy/medium/en_US-amy-medium.onnx?download=true" \
  -O models/en_US-amy-medium.onnx

wget "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/amy/medium/en_US-amy-medium.onnx.json?download=true" \
  -O models/en_US-amy-medium.onnx.json
```

### 4. Configure

```bash
cp .env.example .env
```

Fill in the three Discord values — everything else works as-is:

```env
DISCORD_TOKEN=        # Bot tab → Reset Token
DISCORD_CLIENT_ID=    # General Information → Application ID
GUILD_ID=             # Right-click server → Copy Server ID

OLLAMA_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen2.5:7b

WHISPER_BIN=./bin/whisper-cli
WHISPER_MODEL=./models/ggml-base.en.bin

PIPER_BIN=./bin/piper
PIPER_MODEL=./models/en_US-amy-medium.onnx
PIPER_SPEAK_RATE=0.85

SILENCE_MS=900
MIN_UTTERANCE_MS=700
COOLDOWN_MS=2000
MEMORY_DIR=./memory
```

### 5. Discord Developer Portal

1. [discord.com/developers/applications](https://discord.com/developers/applications) → New Application
2. **Bot** tab → Reset Token → copy to `DISCORD_TOKEN`
3. **Bot** tab → Privileged Gateway Intents → enable all three
4. **OAuth2 → URL Generator** → scopes: `bot` + `applications.commands` → permissions: `Connect`, `Speak`, `Use Voice Activity`, `Send Messages`, `View Channels` → open the generated invite URL
5. Discord → User Settings → Advanced → Developer Mode ON → right-click server → Copy Server ID → `GUILD_ID`

## Running

```bash
# Check everything is wired up correctly
npm run diagnose

# Register slash commands (run once, or when commands change)
npm run deploy

# Start
npm run dev
```

## Commands

| Command        | Description                                 |
| -------------- | ------------------------------------------- |
| `/join`        | Join your voice channel and start listening |
| `/leave`       | Leave and save a call summary to memory     |
| `/memory`      | Show what Ember remembers about this server |
| `/clearmemory` | Wipe memory for this server                 |
| `/status`      | Show connection and model info              |
| `/goodnight`   | Multilingual goodnight message              |

You can also **@mention** Ember in any text channel.

## Troubleshooting

**Stuck at `signalling` / `connecting`** — Discord requires DAVE E2EE since March 2026. Make sure `@snazzah/davey` is installed (`npm install @snazzah/davey`) and shows up in `generateDependencyReport()`.

**No audio playback** — run `npm run diagnose` and check the Piper + ffmpeg section.

**Transcripts empty or garbled** — check `@discordjs/opus` built correctly: `node -e "require('@discordjs/opus')"`. If it throws: `npm install @discordjs/opus --build-from-source`.

**Memory not saving** — check write permissions on `./memory/`. Errors are logged as `[memory] saveMemory FAILED`.

## .gitignore

```
bin/
models/
whisper.cpp/
memory/
dist/
node_modules/
.env
```

---

Built by Charlo — [DARKBLAZE.DEV](https://darkblaze.dev)
