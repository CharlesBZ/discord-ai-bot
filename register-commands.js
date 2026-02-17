// register-commands.js
import "dotenv/config";
import { REST, Routes, SlashCommandBuilder } from "discord.js";

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID; // Application ID
const guildId = process.env.DISCORD_GUILD_ID; // Optional (recommended)

if (!token) throw new Error("Missing DISCORD_TOKEN in .env");
if (!clientId) throw new Error("Missing DISCORD_CLIENT_ID in .env");

const joinCommand = new SlashCommandBuilder()
  .setName("join")
  .setDescription("Join your current voice channel");

const leaveCommand = new SlashCommandBuilder()
  .setName("leave")
  .setDescription("Leave the voice channel (and save recap)");

const goodnightCommand = new SlashCommandBuilder()
  .setName("goodnight")
  .setDescription(
    "Say goodnight in multiple languages (and speak in VC if connected)."
  )
  .addIntegerOption((opt) =>
    opt
      .setName("count")
      .setDescription("How many languages (1-8). Default: 4")
      .setMinValue(1)
      .setMaxValue(8)
      .setRequired(false)
  )
  .addBooleanOption((opt) =>
    opt
      .setName("english")
      .setDescription("Include English. Default: true")
      .setRequired(false)
  );

const commands = [joinCommand, leaveCommand, goodnightCommand].map((c) =>
  c.toJSON()
);

const rest = new REST({ version: "10" }).setToken(token);

(async () => {
  try {
    console.log("Registering slash commands...");

    if (guildId) {
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
        body: commands,
      });
      console.log("✅ Registered guild commands.");
    } else {
      await rest.put(Routes.applicationCommands(clientId), { body: commands });
      console.log(
        "✅ Registered global commands (can take up to 1 hour to appear)."
      );
    }
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
