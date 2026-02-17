# Ember

**A fully local voice-to-voice Discord bot** — no paid APIs required.

Neurocore can join Discord voice channels, listen to users speaking, process conversations with a local LLM, and respond naturally with text-to-speech — all while maintaining conversation memory across sessions.

> **Architecture:** Discord VC → Opus decode → Whisper → Ollama → Piper → Discord VC

---

## ✨ Features

- ✅ **Voice-to-voice conversation** in Discord voice channels
- ✅ **Local speech-to-text** via `whisper.cpp`
- ✅ **Local LLM responses** via `Ollama`
- ✅ **Local text-to-speech** via `Piper`
- ✅ **Persistent memory** per server (`./memory/guild_<id>.json`)
- ✅ **Slash commands** (`/join` and `/leave`)
- ✅ **Anti-feedback loop** (bot won't transcribe while speaking)
- ✅ **Spam prevention** with cooldown controls

---

## 📋 Requirements

### System

- **Ubuntu** (recommended)
- **Node.js** LTS (v20 or v22 recommended)
- **NVIDIA GPU** (optional but greatly improves performance)

### External Tools

- **Ollama** running locally at `http://127.0.0.1:11434`
- **whisper.cpp** compiled locally
- **Piper TTS** installed with a US female voice (e.g., `en_US-amy-medium`)

---

## 🚀 Setup Instructions

### 1. Discord Bot Setup

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application → Navigate to **Bot** → Click **Add Bot**
3. Copy your **Bot Token** (keep this secret!)
4. Enable **Privileged Gateway Intents**:
   - ✅ Message Content Intent
5. Invite the bot to your server:
   - Go to OAuth2 → URL Generator
   - Select scopes: `bot`, `applications.commands`
   - Copy the generated URL and open it in your browser

---

### 2. Install Node Dependencies

From the project folder:

```bash
npm install
```

If you encounter the DAVE error, install:

```bash
npm install @snazzah/davey
```

---

### 3. Install & Run Ollama

**Install Ollama:**

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

**Pull a recommended model:**

```bash
ollama pull qwen2.5:7b
```

**Verify the API is running:**

```bash
curl http://127.0.0.1:11434/api/tags
```

---

### 4. Install whisper.cpp

```bash
sudo apt update
sudo apt install -y build-essential cmake git

cd ~
git clone https://github.com/ggml-org/whisper.cpp
cd whisper.cpp
cmake -B build
cmake --build build -j
bash ./models/download-ggml-model.sh base.en
```

**Test the installation:**

```bash
./build/bin/whisper-cli -m ./models/ggml-base.en.bin -f ./samples/jfk.wav
```

---

### 5. Install Piper TTS

**Install required runtime packages:**

```bash
sudo apt update
sudo apt install -y espeak-ng espeak-ng-data libespeak-ng1
```

**Download a Piper voice model** (Amy - US female):

```bash
mkdir -p ~/piper/voices
cd ~/piper/voices

wget -O en_US-amy-medium.onnx \
https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/amy/medium/en_US-amy-medium.onnx?download=true

wget -O en_US-amy-medium.onnx.json \
https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/amy/medium/en_US-amy-medium.onnx.json?download=true
```

**Test Piper output:**

```bash
echo "Neurocore online." | piper \
  --model ~/piper/voices/en_US-amy-medium.onnx \
  --output_file /tmp/piper_test.wav

ls -lh /tmp/piper_test.wav
```

---

### 6. Configure Environment Variables

Create a `.env` file in the project root:

```env
DISCORD_TOKEN=YOUR_DISCORD_BOT_TOKEN

# Ollama
OLLAMA_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen2.5:7b

# Piper
PIPER_BIN=/usr/local/bin/piper
PIPER_MODEL=/home/youruser/piper/voices/en_US-amy-medium.onnx
PIPER_SPEAK_RATE=0.85

# whisper.cpp
WHISPER_BIN=/home/youruser/whisper.cpp/build/bin/whisper-cli
WHISPER_MODEL=/home/youruser/whisper.cpp/models/ggml-base.en.bin

# Tuning parameters
SILENCE_MS=900
MIN_UTTERANCE_MS=700
COOLDOWN_MS=2000
```

**Note:** If Piper is not in `/usr/local/bin`, set `PIPER_BIN` to the actual file path.

---

### 7. Register Slash Commands

This project includes a `register-commands.js` script to register `/join` and `/leave` commands.

Run:

```bash
npm run register
```

**Tip:** For instant commands during development, register guild-specific commands instead of global commands.

---

### 8. Start the Bot

```bash
npm start
```

You should see:

- Logged in message
- Paths printed for Ollama/Whisper/Piper

---

## 🎮 Usage (in Discord)

1. **Join a voice channel** in your Discord server
2. **Run the command:**
   ```
   /join
   ```
3. **Speak normally** in the voice channel
4. **Wait ~1 second** after you stop talking
5. **The bot will respond** with voice

**To leave:**

```
/leave
```

_(This also saves a call recap to memory)_

---

## 💾 Memory System

Memory is stored per server in:

```
./memory/guild_<SERVER_ID>.json
```

Each memory file contains:

- **`call_summary`**: A bullet-point recap of the last call
- **`recent_turns`**: Rolling conversation context

The bot injects both into the prompt, enabling it to remember previous sessions.

---

## ⚙️ Tuning Parameters

Adjust these values in your `.env` file:

| Issue                            | Solution                                   |
| -------------------------------- | ------------------------------------------ |
| Bot interrupts too quickly       | Increase `SILENCE_MS` (e.g., `1200`)       |
| Bot responds to background noise | Increase `MIN_UTTERANCE_MS` (e.g., `1200`) |
| Bot is too spammy                | Increase `COOLDOWN_MS` (e.g., `3000`)      |
| Speech is too fast               | Lower `PIPER_SPEAK_RATE` (e.g., `0.78`)    |

---

## 🔧 Troubleshooting

### "Used disallowed intents"

Enable **Message Content Intent** in Discord Developer Portal → Bot → Privileged Gateway Intents.

### "Cannot utilize the DAVE protocol..."

Install the required package:

```bash
npm install @snazzah/davey
```

### Piper shared library errors

Install runtime dependencies:

```bash
sudo apt install -y espeak-ng espeak-ng-data libespeak-ng1
```

### "Ollama model not found"

List available models:

```bash
ollama list
```

Pull the model:

```bash
ollama pull qwen2.5:7b
```

---

## 🗺️ Roadmap

- [ ] Push-to-talk mode (`/listen on|off`)
- [ ] Better diarization (multi-speaker tracking)
- [ ] User profile facts memory (preferences, nicknames)
- [ ] Web dashboard for moderation & settings
- [ ] Dockerized one-command deployment

---

## 📄 License

MIT License

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

---

**Built with ❤️ for Discord communities**
