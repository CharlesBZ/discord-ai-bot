import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { config } from "./config";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MemoryTurn {
  role: "user" | "ember";
  text: string;
  ts: number;
  userId?: string;
  username?: string;
}

export interface GuildMemory {
  call_summary: string;
  recent_turns: MemoryTurn[];
  last_updated: string | null;
}

// ── Init ──────────────────────────────────────────────────────────────────────

await mkdir(config.memory.dir, { recursive: true });

// ── Helpers ───────────────────────────────────────────────────────────────────

function memPath(guildId: string): string {
  return path.join(config.memory.dir, `guild_${guildId}.json`);
}

function emptyMemory(): GuildMemory {
  return { call_summary: "", recent_turns: [], last_updated: null };
}

/** Rudimentary check — never store tokens/passwords */
export function isSafeToStore(text: string): boolean {
  const lower = text.toLowerCase();
  if (
    lower.includes("password") ||
    lower.includes("api key") ||
    lower.includes("secret")
  )
    return false;
  if (/sk-[a-z0-9]{10,}/i.test(text)) return false;
  return true;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function loadMemory(guildId: string): Promise<GuildMemory> {
  try {
    const raw = await readFile(memPath(guildId), "utf8");
    const parsed = JSON.parse(raw) as Partial<GuildMemory>;
    return {
      call_summary: parsed.call_summary ?? "",
      recent_turns: Array.isArray(parsed.recent_turns)
        ? parsed.recent_turns
        : [],
      last_updated: parsed.last_updated ?? null,
    };
  } catch (err) {
    // File not found on first run is expected — anything else log it
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error(`[memory] loadMemory(${guildId}) failed:`, err);
    }
    return emptyMemory();
  }
}

export async function saveMemory(
  guildId: string,
  memory: GuildMemory,
): Promise<void> {
  try {
    memory.last_updated = new Date().toISOString();
    await writeFile(memPath(guildId), JSON.stringify(memory, null, 2), "utf8");
    console.log(`[memory] Saved guild_${guildId}.json`);
  } catch (err) {
    // BUG FIX: was previously swallowed silently — now always logged
    console.error(`[memory] saveMemory(${guildId}) FAILED:`, err);
    throw err;
  }
}

export function pushTurn(
  memory: GuildMemory,
  turn: MemoryTurn,
  maxTurns = config.memory.maxRecentTurns,
): void {
  memory.recent_turns.push(turn);
  if (memory.recent_turns.length > maxTurns) {
    memory.recent_turns.splice(0, memory.recent_turns.length - maxTurns);
  }
}

export function formatTurnsForPrompt(turns: MemoryTurn[]): string {
  return turns
    .map((t) =>
      t.role === "user"
        ? `User(${t.username ?? "?"}): ${t.text}`
        : `Ember: ${t.text}`,
    )
    .join("\n");
}
