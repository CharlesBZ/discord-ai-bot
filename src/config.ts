import "dotenv/config";

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val;
}

function optionalEnv(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export const config = {
  discord: {
    token: requireEnv("DISCORD_TOKEN"),
  },
  ollama: {
    url: optionalEnv("OLLAMA_URL", "http://127.0.0.1:11434"),
    model: optionalEnv("OLLAMA_MODEL", "qwen2.5:7b"),
  },
  piper: {
    bin: requireEnv("PIPER_BIN"),
    model: requireEnv("PIPER_MODEL"),
    speakRate: Number(optionalEnv("PIPER_SPEAK_RATE", "0.85")),
  },
  whisper: {
    bin: requireEnv("WHISPER_BIN"),
    model: requireEnv("WHISPER_MODEL"),
  },
  voice: {
    silenceMs: Number(optionalEnv("SILENCE_MS", "900")),
    minUtteranceMs: Number(optionalEnv("MIN_UTTERANCE_MS", "700")),
    cooldownMs: Number(optionalEnv("COOLDOWN_MS", "2000")),
  },
  memory: {
    dir: optionalEnv("MEMORY_DIR", "./memory"),
    maxRecentTurns: 1000,
    summaryTriggerTurns: 6,
  },
} as const;

export type Config = typeof config;
