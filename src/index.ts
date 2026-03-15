import "dotenv/config";
import {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
  Interaction,
  Message,
} from "discord.js";
import { joinVoiceChannel, getVoiceConnection } from "@discordjs/voice";

import { config } from "./config.js";
import { loadMemory, saveMemory } from "./memory.js";
import { generateReply, updateCallSummary } from "./ollama.js";
import {
  getOrCreateState,
  getAllStates,
  wireListening,
  speak,
  buildGoodnightMessage,
} from "./voice.js";

// ── Discord client ─────────────────────────────────────────────────────────────

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // privileged — enable in Dev Portal
    GatewayIntentBits.GuildVoiceStates,
  ],
  partials: [Partials.Channel],
});

// ── Ready ──────────────────────────────────────────────────────────────────────

client.once(Events.ClientReady, () => {
  console.log(`✅  Logged in as ${client.user!.tag}`);
  console.log("    Ollama  :", config.ollama.url, config.ollama.model);
  console.log("    Whisper :", config.whisper.bin);
  console.log("    Piper   :", config.piper.bin);
  console.log("    Memory  :", config.memory.dir);
});

// ── Slash commands ─────────────────────────────────────────────────────────────

client.on(Events.InteractionCreate, async (interaction: Interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, guild, member } = interaction;

  if (!guild) {
    await interaction.reply({
      content: "Use me in a server.",
      ephemeral: true,
    });
    return;
  }

  // /goodnight
  if (commandName === "goodnight") {
    const count = interaction.options.getInteger("count") ?? 4;
    const includeEnglish = interaction.options.getBoolean("english") ?? true;
    const msg = buildGoodnightMessage(count, includeEnglish);

    await interaction.reply(msg);
    speak(guild.id, msg).catch(console.error);
    return;
  }

  // /join
  if (commandName === "join") {
    const voiceChannel = (member as import("discord.js").GuildMember)?.voice
      ?.channel;

    if (!voiceChannel) {
      await interaction.reply({
        content: "Join a voice channel first.",
        ephemeral: true,
      });
      return;
    }

    const connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: guild.id,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      adapterCreator: guild.voiceAdapterCreator as any,
      selfDeaf: false,
      selfMute: false,
    });

    const state = getOrCreateState(guild.id);
    state.connection = connection;

    wireListening(guild.id, client).catch(console.error);

    // Greet with last-call summary if there is one
    const memory = await loadMemory(guild.id);
    if (memory.call_summary.trim()) {
      const greet = `I'm back. Last time we: ${memory.call_summary
        .trim()
        .replace(/\n+/g, " ")
        .slice(0, 240)}`;
      speak(guild.id, greet).catch(console.error);
    }

    await interaction.reply(
      `🎤 Joined **${voiceChannel.name}**. Talk in VC — I'm listening.`,
    );
    return;
  }

  // /leave
  if (commandName === "leave") {
    await interaction.deferReply({ ephemeral: true });

    try {
      const hourNY = Number(
        new Date().toLocaleString("en-US", {
          timeZone: "America/New_York",
          hour: "numeric",
          hour12: false,
        }),
      );

      if (hourNY >= 21 || hourNY <= 4) {
        const msg = buildGoodnightMessage(4, true);
        await speak(guild.id, msg);
      }

      await updateCallSummary(guild.id);
    } catch (err) {
      console.error("[index] /leave error:", err);
    }

    const conn = getVoiceConnection(guild.id);
    if (conn) conn.destroy();

    const state = getOrCreateState(guild.id);
    state.connection = null;
    state.listeningWired = false;
    state.activeListen.clear();

    await interaction.editReply("👋 Left voice and saved a recap.");
    return;
  }

  // /memory — show call summary + recent turns
  if (commandName === "memory") {
    const turns = interaction.options.getInteger("turns") ?? 10;
    const memory = await loadMemory(guild.id);

    const summaryBlock = memory.call_summary.trim()
      ? `**📝 Call summary:**\n${memory.call_summary.trim()}`
      : "**📝 Call summary:** *(none yet)*";

    const recentTurns = memory.recent_turns.slice(-turns);
    const turnsBlock = recentTurns.length
      ? recentTurns
          .map((t) => {
            const who =
              t.role === "user" ? `👤 ${t.username ?? "user"}` : "🤖 Ember";
            const time = new Date(t.ts).toLocaleTimeString("en-US", {
              timeZone: "America/New_York",
              hour: "2-digit",
              minute: "2-digit",
            });
            return `\`${time}\` **${who}:** ${t.text}`;
          })
          .join("\n")
      : "*(no recent turns)*";

    const lastUpdated = memory.last_updated
      ? `\n\n*Last updated: ${new Date(memory.last_updated).toLocaleString("en-US", { timeZone: "America/New_York" })} ET*`
      : "";

    const body = `${summaryBlock}\n\n**🕐 Last ${recentTurns.length} turns:**\n${turnsBlock}${lastUpdated}`;

    // Discord messages cap at 2000 chars — truncate gracefully
    const truncated = body.length > 1900 ? body.slice(0, 1897) + "…" : body;

    await interaction.reply({ content: truncated, ephemeral: true });
    return;
  }

  // /clearmemory — wipe guild memory
  if (commandName === "clearmemory") {
    await saveMemory(guild.id, {
      call_summary: "",
      recent_turns: [],
      last_updated: new Date().toISOString(),
    });
    await interaction.reply({
      content: "🗑️ Memory wiped. I remember nothing. Fresh start.",
      ephemeral: true,
    });
    return;
  }

  // /status — voice + model info
  if (commandName === "status") {
    const state = getOrCreateState(guild.id);
    const connected = !!state.connection;
    const speaking = state.isSpeaking;
    const listening = state.activeListen.size;
    const queued = state.activeListen.size;

    const lines = [
      `**🎙️ Voice:** ${connected ? "✅ Connected" : "❌ Not in a channel"}`,
      connected
        ? `**🔊 Speaking:** ${speaking ? "Yes" : "No"}  |  **👂 Active listeners:** ${listening}`
        : "",
      `**🤖 Model:** \`${config.ollama.model}\` @ \`${config.ollama.url}\``,
      `**🗣️ STT:** \`${config.whisper.bin.split("/").pop()}\``,
      `**🔈 TTS:** Piper \`${config.piper.model.split("/").pop()}\``,
      `**💾 Memory dir:** \`${config.memory.dir}\``,
    ]
      .filter(Boolean)
      .join("\n");

    await interaction.reply({ content: lines, ephemeral: true });
    return;
  }
});

// ── Text mention fallback ──────────────────────────────────────────────────────

client.on(Events.MessageCreate, async (message: Message) => {
  try {
    if (message.author.bot) return;
    if (!message.guild) return;
    if (!message.mentions.has(client.user!)) return;

    const cleaned = message.content
      .replaceAll(`<@${client.user!.id}>`, "")
      .replaceAll(`<@!${client.user!.id}>`, "")
      .trim();

    if (!cleaned) {
      await message.reply("Say something after you ping me 😈");
      return;
    }
    if (cleaned.length > 500) {
      await message.reply("Too long. My brain is small.");
      return;
    }

    if ("sendTyping" in message.channel) await message.channel.sendTyping();

    const reply = await generateReply({
      guildId: message.guild.id,
      transcript: cleaned,
      username: message.author.username,
      userId: message.author.id,
    });

    await message.reply(reply);
    speak(message.guild.id, reply).catch(console.error);
  } catch (err) {
    console.error("[index] MessageCreate error:", err);
  }
});

// ── Graceful shutdown ──────────────────────────────────────────────────────────

async function shutdown(signal: string): Promise<void> {
  console.log(
    `\n[index] ${signal} received — saving summaries and shutting down.`,
  );
  const promises: Promise<void>[] = [];

  for (const [guildId, state] of getAllStates().entries()) {
    if (state.connection) {
      promises.push(
        updateCallSummary(guildId).finally(() => {
          const conn = getVoiceConnection(guildId);
          conn?.destroy();
        }),
      );
    }
  }

  await Promise.allSettled(promises);
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// ── Start ──────────────────────────────────────────────────────────────────────

client.login(config.discord.token);
