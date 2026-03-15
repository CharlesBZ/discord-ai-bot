import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import path from "node:path";
import os from "node:os";
// @ts-ignore — ffmpeg-static has no bundled types but exports a string path
import ffmpegPath from "ffmpeg-static";
import {
  createAudioResource,
  AudioResource,
  StreamType,
} from "@discordjs/voice";
import { config } from "./config";

/**
 * Run Piper TTS on `text` and write a WAV to a temp file.
 * Returns the temp file path — caller is responsible for cleanup.
 */
async function piperToWav(text: string): Promise<string> {
  const wavPath = path.join(
    os.tmpdir(),
    `ember_tts_${Date.now()}_${Math.random().toString(16).slice(2)}.wav`,
  );

  // Piper length_scale is inverse of speed (1.0 = normal, 0.8 = faster)
  const speed = Math.max(0.6, Math.min(1.6, config.piper.speakRate));
  const lengthScale = String(1.0 / speed);

  const args = [
    "--model",
    config.piper.model,
    "--output_file",
    wavPath,
    "--length_scale",
    lengthScale,
  ];

  await new Promise<void>((resolve, reject) => {
    const proc = spawn(config.piper.bin, args, {
      stdio: ["pipe", "ignore", "pipe"],
    });

    let stderr = "";
    proc.stderr.on("data", (d: Buffer) => (stderr += d.toString("utf8")));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) return resolve();
      reject(new Error(`Piper exited ${code}: ${stderr}`));
    });

    proc.stdin.write(text);
    proc.stdin.end();
  });

  return wavPath;
}

/**
 * BUG FIX: Piper outputs WAV at its model's native sample rate (often 22050Hz).
 * Discord's @discordjs/voice requires Opus-compatible audio: 48kHz stereo s16le.
 * Previously the bot used StreamType.Arbitrary on the raw WAV which caused
 * @discordjs/voice's internal FFmpeg transcoder to sometimes fail silently —
 * resulting in Piper finishing but no audio ever playing back.
 *
 * Fix: pipe through ffmpeg ourselves to produce s16le PCM at 48kHz stereo,
 * then hand that to createAudioResource with StreamType.Raw so @discordjs/voice
 * knows exactly what it's getting and doesn't need to guess or transcode.
 */
export async function createTtsResource(text: string): Promise<{
  resource: AudioResource;
  cleanup: () => Promise<void>;
}> {
  const wavPath = await piperToWav(text);

  // Resample Piper's WAV → 48kHz stereo s16le PCM via ffmpeg
  const ffmpeg = spawn(
    ffmpegPath as string,
    [
      "-loglevel",
      "error",
      "-i",
      wavPath,
      "-ar",
      "48000", // 48kHz — Discord/Opus requirement
      "-ac",
      "2", // stereo
      "-f",
      "s16le", // signed 16-bit little-endian PCM
      "pipe:1", // write to stdout
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );

  let ffmpegErr = "";
  ffmpeg.stderr?.on("data", (d: Buffer) => (ffmpegErr += d.toString()));

  ffmpeg.on("error", (err) => {
    console.error("[tts] ffmpeg spawn error:", err);
  });

  // Log but don't crash if ffmpeg exits non-zero (stream may still be partial)
  ffmpeg.on("close", (code) => {
    if (code !== 0 && code !== null) {
      console.error(`[tts] ffmpeg exited ${code}: ${ffmpegErr}`);
    }
  });

  const resource = createAudioResource(ffmpeg.stdout!, {
    inputType: StreamType.Raw, // tell @discordjs/voice: this is already s16le PCM
  });

  const cleanup = async () => {
    try {
      const { unlink } = await import("node:fs/promises");
      await unlink(wavPath);
    } catch {
      // ignore — temp file cleanup is best-effort
    }
  };

  return { resource, cleanup };
}
