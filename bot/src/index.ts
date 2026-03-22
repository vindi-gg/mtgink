import { Client, Events, GatewayIntentBits, type Interaction } from "discord.js";
import { config } from "./config.js";
import * as showdown from "./commands/showdown.js";
import { getMatchup, hasVoted, recordLocalVote } from "./lib/vote-tracker.js";
import { recordVote } from "./lib/queries.js";

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, (c) => {
  console.log(`Logged in as ${c.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction: Interaction) => {
  // Slash command
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === "showdown") {
      await showdown.execute(interaction);
    }
    return;
  }

  // Autocomplete
  if (interaction.isAutocomplete()) {
    if (interaction.commandName === "showdown") {
      await showdown.autocomplete(interaction);
    }
    return;
  }

  // Button
  if (interaction.isButton()) {
    const parts = interaction.customId.split(":");
    if (parts[0] !== "vote" || parts.length !== 3) return;

    const matchupId = parts[1];
    const side = parts[2] as "a" | "b";
    if (side !== "a" && side !== "b") return;

    const matchup = getMatchup(matchupId);
    if (!matchup) {
      await interaction.reply({ content: "This showdown has expired.", ephemeral: true });
      return;
    }

    const userId = interaction.user.id;
    if (hasVoted(matchupId, userId)) {
      await interaction.reply({ content: "You already voted!", ephemeral: true });
      return;
    }

    // Record vote locally + in DB
    const winner = side === "a" ? matchup.a : matchup.b;
    const loser = side === "a" ? matchup.b : matchup.a;

    try {
      await recordVote(
        {
          oracle_id: matchup.card.oracle_id,
          winner_illustration_id: winner.illustration_id,
          loser_illustration_id: loser.illustration_id,
          session_id: `discord:${userId}`,
          vote_source: "discord",
        },
        32
      );
      recordLocalVote(matchupId, userId, side);

      const artist = side === "a" ? matchup.a.artist : matchup.b.artist;
      const totalVotes = matchup.voteCounts.a + matchup.voteCounts.b;
      await interaction.reply({
        content: `You voted for **${artist}**! (${totalVotes} total vote${totalVotes === 1 ? "" : "s"} on this showdown)`,
        ephemeral: true,
      });

      // Update the original message footer with vote counts
      try {
        const message = interaction.message;
        const embed = message.embeds[0];
        if (embed) {
          const { EmbedBuilder } = await import("discord.js");
          const updated = EmbedBuilder.from(embed).setFooter({
            text: `Votes: ${matchup.voteCounts.a} vs ${matchup.voteCounts.b}`,
          });
          await message.edit({ embeds: [updated] });
        }
      } catch {
        // Non-critical — embed update can fail silently
      }
    } catch (err) {
      console.error("Vote error:", err);
      await interaction.reply({
        content: "Failed to record your vote. Try again!",
        ephemeral: true,
      });
    }
  }
});

client.login(config.DISCORD_TOKEN);
