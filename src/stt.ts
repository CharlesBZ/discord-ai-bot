import { spawn } from "node:child_process";
import { config } from "./config";

/**
 * Transcribe a 16kHz mono WAV file using whisper.cpp CLI.
 * Returns the transcript string, or empty string if nothing was heard.
 */
export async function transcribe(wavPath: string): Promise<string> {
  const args = [
    "-m",
    config.whisper.model,
    "-f",
    wavPath,
    "-nt", // no timestamps
    "-np", // no progress
  ];

  const stdout = await new Promise<string>((resolve, reject) => {
    const proc = spawn(config.whisper.bin, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let out = "";
    let err = "";

    proc.stdout.on("data", (d: Buffer) => (out += d.toString("utf8")));
    proc.stderr.on("data", (d: Buffer) => (err += d.toString("utf8")));

    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) return resolve(out.trim());
      reject(new Error(`whisper-cli exited ${code}: ${err}`));
    });
  });

  return stdout.replace(/\s+/g, " ").trim();
}

/**
 * Build a 16-bit PCM mono WAV buffer from raw PCM bytes.
 * Discord sends 16kHz mono signed-16 PCM via the Opus decoder.
 */
export function pcmToWav(
  pcmBuffer: Buffer,
  sampleRate = 16000,
  channels = 1,
): Buffer {
  const bitsPerSample = 16;
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  const dataSize = pcmBuffer.length;
  const header = Buffer.alloc(44);

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // PCM chunk size
  header.writeUInt16LE(1, 20); // PCM format
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmBuffer]);
}
