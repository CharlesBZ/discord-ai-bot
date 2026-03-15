/**
 * deploy-commands.ts
 *
 * Run once (or any time you change a command) to register slash commands
 * with Discord's REST API.
 *
 * Guild deploy  (instant, recommended for dev):
 *   GUILD_ID=your_guild_id npx tsx src/deploy-commands.ts
 *
 * Global deploy (up to 1hr propagation, use for production):
 *   npx tsx src/deploy-commands.ts --global
 */

import "dotenv/config";
import { REST, Routes } from "discord.js";
import {
  SlashCommandBuilder,
  SlashCommandIntegerOption,
  SlashCommandBooleanOption,
} from "@discordjs/builders";

// ── Env ───────────────────────────────────────────────────────────────────────

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID; // optional — omit for global deploy

if (!TOKEN) throw new Error("Missing DISCORD_TOKEN in .env");
if (!CLIENT_ID) throw new Error("Missing DISCORD_CLIENT_ID in .env");

const isGlobal = process.argv.includes("--global");

if (!isGlobal && !GUILD_ID) {
  throw new Error(
    "Missing GUILD_ID in .env (required for guild deploy).\n" +
      "Set GUILD_ID=your_server_id  OR  pass --global for a global deploy.",
  );
}

// ── Command definitions ───────────────────────────────────────────────────────

const commands = [
  // /join — bot joins your current voice channel
  new SlashCommandBuilder()
    .setName("join")
    .setDescription(
      "Ember joins your current voice channel and starts listening.",
    ),

  // /leave — bot leaves and saves call summary
  new SlashCommandBuilder()
    .setName("leave")
    .setDescription("Ember leaves voice, saves a recap of the call to memory."),

  // /goodnight — multilingual goodnight message (spoken + posted)
  new SlashCommandBuilder()
    .setName("goodnight")
    .setDescription("Ember says goodnight in several languages.")
    .addIntegerOption(
      new SlashCommandIntegerOption()
        .setName("count")
        .setDescription("How many languages to include (1–8, default 4)")
        .setMinValue(1)
        .setMaxValue(8)
        .setRequired(false),
    )
    .addBooleanOption(
      new SlashCommandBooleanOption()
        .setName("english")
        .setDescription("Include English? (default true)")
        .setRequired(false),
    ),

  // /memory — show what Ember remembers about this server
  new SlashCommandBuilder()
    .setName("memory")
    .setDescription(
      "Show Ember's current memory for this server (call summary + recent turns).",
    )
    .addIntegerOption(
      new SlashCommandIntegerOption()
        .setName("turns")
        .setDescription("How many recent turns to show (default 10, max 30)")
        .setMinValue(1)
        .setMaxValue(30)
        .setRequired(false),
    ),

  // /clearmemory — wipe guild memory
  new SlashCommandBuilder()
    .setName("clearmemory")
    .setDescription(
      "⚠️ Wipe Ember's memory for this server (call summary + all turns).",
    ),

  // /status — show voice / model status
  new SlashCommandBuilder()
    .setName("status")
    .setDescription("Show Ember's current voice connection and model status."),
].map((cmd) => cmd.toJSON());

// ── Deploy ────────────────────────────────────────────────────────────────────

const rest = new REST({ version: "10" }).setToken(TOKEN);

async function deploy(): Promise<void> {
  console.log(`\nDeploying ${commands.length} slash commands…`);
  console.log(`Mode: ${isGlobal ? "GLOBAL" : `GUILD  (${GUILD_ID})`}\n`);

  try {
    const route = isGlobal
      ? Routes.applicationCommands(CLIENT_ID!)
      : Routes.applicationGuildCommands(CLIENT_ID!, GUILD_ID!);

    const data = (await rest.put(route, { body: commands })) as unknown[];

    console.log(`✅  Successfully registered ${data.length} commands.\n`);

    if (isGlobal) {
      console.log(
        "ℹ️  Global commands can take up to 1 hour to appear in all servers.",
      );
    } else {
      console.log("ℹ️  Guild commands are available immediately.");
    }
  } catch (err) {
    console.error("❌  Deploy failed:", err);
    process.exit(1);
  }
}

deploy();
