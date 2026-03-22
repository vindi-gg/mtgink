import { REST, Routes } from "discord.js";
import { config } from "./config.js";
import { data as showdownCommand } from "./commands/showdown.js";

const rest = new REST().setToken(config.DISCORD_TOKEN);

async function main() {
  console.log("Registering slash commands...");

  await rest.put(Routes.applicationCommands(config.DISCORD_CLIENT_ID), {
    body: [showdownCommand.toJSON()],
  });

  console.log("Done! /showdown command registered globally.");
}

main().catch(console.error);
