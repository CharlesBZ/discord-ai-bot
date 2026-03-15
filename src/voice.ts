import { writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import prism from "prism-media";
import {
  VoiceConnection,
  VoiceConnectionStatus,
  createAudioPlayer,
  AudioPlayer,
  AudioPlayerStatus,
  EndBehaviorType,
  entersState,
} from "@discordjs/voice";
import { Client } from "discord.js";
import { config } from "./config.js";
import { pcmToWav, transcribe } from "./stt.js";
import { createTtsResource } from "./tts.js";
import { generateReply } from "./ollama.js";

// ── Goodnight phrases ─────────────────────────────────────────────────────────

const GOODNIGHT_PHRASES = [
  { lang: "English", code: "en", text: "Goodnight!" },
  { lang: "Spanish", code: "es", text: "Buenas noches." },
  { lang: "French", code: "fr", text: "Bonne nuit." },
  { lang: "Japanese", code: "ja", text: "Oyasumi nasai." },
  { lang: "German", code: "de", text: "Gute Nacht." },
  { lang: "Italian", code: "it", text: "Buonanotte." },
  { lang: "Korean", code: "ko", text: "Jal ja." },
  { lang: "Mandarin", code: "zh", text: "Wan an." },
];

function pickRandom<T>(arr: T[], n: number): T[] {
  const copy = [...arr];
  const out: T[] = [];
  while (copy.length && out.length < n) {
    const idx = Math.floor(Math.random() * copy.length);
    out.push(copy.splice(idx, 1)[0]!);
  }
  return out;
}

export function buildGoodnightMessage(
  count = 4,
  includeEnglish = true,
): string {
  const pool = includeEnglish
    ? GOODNIGHT_PHRASES
    : GOODNIGHT_PHRASES.filter((p) => p.code !== "en");
  const picks = pickRandom(pool, Math.max(1, Math.min(8, count)));
  return `System shutting down… ${picks.map((p) => `${p.text} (${p.lang})`).join("  ")}`;
}

// ── Per-guild state ───────────────────────────────────────────────────────────

interface GuildVoiceState {
  connection: VoiceConnection | null;
  player: AudioPlayer;
  queue: Promise<void>;
  isSpeaking: boolean;
  activeListen: Set<string>;
  lastHeard: Map<string, number>;
  listeningWired: boolean;
}

const states = new Map<string, GuildVoiceState>();

export function getOrCreateState(guildId: string): GuildVoiceState {
  if (!states.has(guildId)) {
    states.set(guildId, {
      connection: null,
      player: createAudioPlayer(),
      queue: Promise.resolve(),
      isSpeaking: false,
      activeListen: new Set(),
      lastHeard: new Map(),
      listeningWired: false,
    });
  }
  return states.get(guildId)!;
}

export function getAllStates(): Map<string, GuildVoiceState> {
  return states;
}

// ── Speak ─────────────────────────────────────────────────────────────────────

export function speak(guildId: string, text: string): Promise<void> {
  const state = getOrCreateState(guildId);

  state.queue = state.queue
    .then(async () => {
      if (!state.connection) {
        console.warn("[voice] speak() called but no connection — skipping");
        return;
      }

      let cleanup: (() => Promise<void>) | null = null;
      try {
        state.isSpeaking = true;
        console.log(`[voice] 🔊 Speaking: "${text.slice(0, 80)}"`);

        const { resource, cleanup: c } = await createTtsResource(text);
        cleanup = c;

        state.player.play(resource);
        state.connection.subscribe(state.player);

        await new Promise<void>((resolve, reject) => {
          const onIdle = () => {
            state.player.off(AudioPlayerStatus.Idle, onIdle);
            state.player.off("error", onError);
            resolve();
          };
          const onError = (err: Error) => {
            state.player.off(AudioPlayerStatus.Idle, onIdle);
            state.player.off("error", onError);
            reject(err);
          };
          state.player.once(AudioPlayerStatus.Idle, onIdle);
          state.player.once("error", onError);
        });

        console.log("[voice] ✅ Finished speaking");
      } catch (err) {
        console.error("[voice] speak() error:", err);
      } finally {
        state.isSpeaking = false;
        await cleanup?.();
      }
    })
    .catch((err) => {
      states.get(guildId)!.isSpeaking = false;
      console.error("[voice] Queue crashed:", err);
    });

  return state.queue;
}

// ── Handle utterance ──────────────────────────────────────────────────────────

async function handleUtterance(
  guildId: string,
  userId: string,
  username: string,
  pcmBuffer: Buffer,
): Promise<void> {
  const approxMs = Math.floor((pcmBuffer.length / 2 / 16000) * 1000);
  console.log(`[voice] 🎤 Utterance from ${username}: ~${approxMs}ms of audio`);

  if (approxMs < config.voice.minUtteranceMs) {
    console.log(
      `[voice] ⏭️  Too short (min ${config.voice.minUtteranceMs}ms) — skipping`,
    );
    return;
  }

  const wavBuf = pcmToWav(pcmBuffer, 16000, 1);
  const wavPath = path.join(
    os.tmpdir(),
    `ember_in_${guildId}_${userId}_${Date.now()}.wav`,
  );

  try {
    await writeFile(wavPath, wavBuf);
    console.log(`[voice] 📝 Running Whisper…`);

    const transcript = await transcribe(wavPath);
    console.log(`[voice] 📝 Transcript: "${transcript}"`);

    if (!transcript || transcript.length < 2) {
      console.log("[voice] Empty transcript — skipping");
      return;
    }

    const lower = transcript.toLowerCase().trim();
    if (
      lower.includes("goodnight") ||
      lower.includes("good night") ||
      lower === "gn"
    ) {
      await speak(guildId, buildGoodnightMessage(4, true));
      return;
    }

    console.log(`[voice] 🤖 Sending to Ollama…`);
    const reply = await generateReply({
      guildId,
      transcript,
      username,
      userId,
    });
    console.log(`[voice] 💬 Ember → "${reply}"`);
    await speak(guildId, reply);
  } catch (err) {
    console.error("[voice] ❌ handleUtterance error:", err);
  } finally {
    await unlink(wavPath).catch(() => {});
  }
}

// ── Wire listening ────────────────────────────────────────────────────────────

export async function wireListening(
  guildId: string,
  discordClient: Client,
): Promise<void> {
  const state = getOrCreateState(guildId);

  if (!state.connection) {
    console.error("[voice] wireListening called with no connection");
    return;
  }

  // FIX 1: Wait for Ready before wiring receiver.speaking.
  // joinVoiceChannel() returns immediately while UDP handshake is still
  // in progress. Speaking events never fire until the connection is Ready.
  //
  // State machine:
  //   Signalling  → bot sent JOIN, waiting for Discord to assign a voice server
  //   Connecting  → got voice server, attempting UDP hole-punch
  //   Ready       → fully connected
  //   Disconnected / Destroyed → something went wrong
  const stateLogger = (_old: unknown, next: { status: string }) => {
    console.log(`[voice] 🔄 → ${next.status}`);
  };
  state.connection.on("stateChange", stateLogger);

  try {
    console.log(
      `[voice] ⏳ Waiting for Ready… (currently: ${state.connection.state.status})`,
    );
    await entersState(state.connection, VoiceConnectionStatus.Ready, 30_000);
    console.log("[voice] ✅ Voice connection Ready");
  } catch {
    const stuck = state.connection.state.status;
    console.error(`[voice] ❌ Stuck at "${stuck}" after 30s`);
    if (stuck === "signalling") {
      console.error("  → Discord never returned a voice server.");
      console.error(
        "    ✔ Check GuildVoiceStates intent is ON in Dev Portal → Bot → Privileged Intents",
      );
      console.error(
        "    ✔ Check bot has Connect + Speak permissions in the voice channel",
      );
    } else if (stuck === "connecting") {
      console.error(
        "  → UDP handshake failed. Almost always a network/firewall issue.",
      );
      console.error("    ✔ Outbound UDP ports 50000–65535 must be open");
      console.error("    ✔ If behind strict NAT/corporate network, try a VPS");
      console.error("    ✔ Try: sudo ufw allow out 50000:65535/udp");
    }
    state.connection.off("stateChange", stateLogger);
    return;
  }

  state.connection.off("stateChange", stateLogger);

  if (state.listeningWired) {
    console.log("[voice] Already wired — skipping");
    return;
  }
  state.listeningWired = true;

  // FIX 2: Watch connection state changes — rewire on reconnect, clear on drop
  state.connection.on("stateChange", (_old, newState) => {
    console.log(`[voice] Connection → ${newState.status}`);
    if (
      newState.status === VoiceConnectionStatus.Disconnected ||
      newState.status === VoiceConnectionStatus.Destroyed
    ) {
      console.warn("[voice] ⚠️  Disconnected — resetting wire flag");
      state.listeningWired = false;
      state.activeListen.clear();
    }
  });

  const receiver = state.connection.receiver;

  console.log("[voice] 👂 Wiring receiver.speaking…");

  receiver.speaking.on("start", (userId: string) => {
    console.log(`[voice] 🗣️  Speaking start: ${userId}`);

    if (state.isSpeaking) {
      console.log("[voice] I'm speaking — skip");
      return;
    }
    if (state.activeListen.has(userId)) {
      console.log("[voice] Already capturing — skip");
      return;
    }
    if (userId === discordClient.user?.id) {
      console.log("[voice] That's me — skip");
      return;
    }

    const now = Date.now();
    const elapsed = now - (state.lastHeard.get(userId) ?? 0);
    if (elapsed < config.voice.cooldownMs) {
      console.log(`[voice] Cooldown (${elapsed}ms) — skip`);
      return;
    }

    state.lastHeard.set(userId, now);
    state.activeListen.add(userId);

    try {
      const opusStream = receiver.subscribe(userId, {
        end: {
          behavior: EndBehaviorType.AfterSilence,
          duration: config.voice.silenceMs,
        },
      });

      opusStream.on("error", (err) => {
        state.activeListen.delete(userId);
        console.error("[voice] Opus error:", err?.message ?? err);
      });

      // FIX 3: Decoder params must match what Discord actually sends.
      // Discord sends Opus encoded at 48kHz stereo.
      // The old code used rate:16000 channels:1 frameSize:320 which is WRONG —
      // it caused the decoder to produce garbage or nothing at all.
      const decoder = new prism.opus.Decoder({
        rate: 48000, // Discord sends 48kHz
        channels: 2, // Discord sends stereo
        frameSize: 960, // 48000 * 0.02s = 960 samples/frame
      });

      decoder.on("error", (err: Error) => {
        state.activeListen.delete(userId);
        console.error("[voice] Decoder error:", err?.message ?? err);
      });

      const chunks: Buffer[] = [];
      let total = 0;
      let packets = 0;

      opusStream
        .pipe(decoder)
        .on("data", (chunk: Buffer) => {
          chunks.push(chunk);
          total += chunk.length;
          packets++;
          if (packets === 1)
            console.log("[voice] 📦 First audio packet decoded");
        })
        .once("end", async () => {
          state.activeListen.delete(userId);
          console.log(
            `[voice] 🔚 Stream ended — ${packets} packets, ${total} bytes`,
          );

          if (state.isSpeaking) {
            console.log("[voice] Bot speaking mid-capture — discarding");
            return;
          }

          const guild = discordClient.guilds.cache.get(guildId);
          const member = guild?.members?.cache?.get(userId);
          const username =
            member?.displayName ?? member?.user?.username ?? "someone";

          // FIX 4: Downsample 48kHz stereo → 16kHz mono for Whisper.
          // Previously raw 48kHz stereo bytes were written into a WAV header
          // claiming 16kHz mono — Whisper read it as quadruple-speed garbage.
          const pcm48stereo = Buffer.concat(chunks, total);
          const pcm16mono = downsample48kStereoTo16kMono(pcm48stereo);
          console.log(
            `[voice] Downsampled ${pcm48stereo.length}B → ${pcm16mono.length}B`,
          );

          await handleUtterance(guildId, userId, username, pcm16mono);
        })
        .once("error", (err: Error) => {
          state.activeListen.delete(userId);
          console.error("[voice] Stream error:", err?.message ?? err);
        });
    } catch (err) {
      state.activeListen.delete(userId);
      console.error("[voice] Subscribe failed:", (err as Error).message ?? err);
    }
  });

  receiver.speaking.on("end", (userId: string) => {
    console.log(`[voice] 🔕 Speaking end: ${userId}`);
  });

  console.log("[voice] ✅ Listening pipeline wired");
}

// ── Downsample 48kHz stereo s16le → 16kHz mono s16le ─────────────────────────
// Whisper needs 16kHz mono. Discord gives 48kHz stereo.
// Strategy: average L+R for mono, then decimate 3:1 for 48k→16k.

function downsample48kStereoTo16kMono(input: Buffer): Buffer {
  // 4 bytes per stereo frame (2 bytes L + 2 bytes R, s16le)
  const frameCount = Math.floor(input.length / 4);
  // Decimate 3:1 → 1 output sample per 3 input frames
  const outSamples = Math.floor(frameCount / 3);
  const output = Buffer.alloc(outSamples * 2);

  let outIdx = 0;
  for (let i = 0; i < outSamples; i++) {
    const bytePos = i * 3 * 4; // every 3rd frame, 4 bytes each
    if (bytePos + 3 >= input.length) break;

    const left = input.readInt16LE(bytePos);
    const right = input.readInt16LE(bytePos + 2);
    const mono = Math.round((left + right) / 2);

    output.writeInt16LE(Math.max(-32768, Math.min(32767, mono)), outIdx);
    outIdx += 2;
  }

  return output.slice(0, outIdx);
}
