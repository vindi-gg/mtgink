import {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  AttachmentBuilder,
  type ChatInputCommandInteraction,
  type AutocompleteInteraction,
} from "discord.js";
import { searchCards, getRandomCard, getComparisonPair } from "../lib/queries.js";
import { createShowdownImage } from "../lib/image.js";
import { createMatchup } from "../lib/vote-tracker.js";

export const data = new SlashCommandBuilder()
  .setName("showdown")
  .setDescription("Start an art showdown — vote on the best art for a card")
  .addStringOption((opt) =>
    opt
      .setName("card")
      .setDescription("Card name (leave blank for random)")
      .setAutocomplete(true)
      .setRequired(false)
  );

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const query = interaction.options.getFocused();
  if (query.length < 2) {
    await interaction.respond([]);
    return;
  }

  try {
    const cards = await searchCards(query, 25);
    await interaction.respond(
      cards.map((c) => ({ name: c.name.slice(0, 100), value: c.oracle_id }))
    );
  } catch {
    await interaction.respond([]);
  }
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  try {
    const oracleId = interaction.options.getString("card");
    const card = oracleId ? undefined : await getRandomCard();
    const pair = await getComparisonPair(oracleId ?? card!.oracle_id);

    const imageBuffer = await createShowdownImage(pair.a, pair.b);
    const matchupId = createMatchup(pair.card, pair.a, pair.b);

    const attachment = new AttachmentBuilder(imageBuffer, { name: "showdown.jpg" });

    const ratingA = pair.a_rating?.elo_rating ?? 1500;
    const ratingB = pair.b_rating?.elo_rating ?? 1500;

    const embed = new EmbedBuilder()
      .setTitle(`${pair.card.name} — Art Showdown`)
      .setURL(`https://mtg.ink/card/${pair.card.slug}`)
      .setImage("attachment://showdown.jpg")
      .setColor(0xf59e0b)
      .setFooter({ text: `ELO: ${Math.round(ratingA)} vs ${Math.round(ratingB)}` });

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`vote:${matchupId}:a`)
        .setLabel(`Vote: ${pair.a.artist}`)
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`vote:${matchupId}:b`)
        .setLabel(`Vote: ${pair.b.artist}`)
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setLabel("View on mtg.ink")
        .setURL(`https://mtg.ink/card/${pair.card.slug}`)
        .setStyle(ButtonStyle.Link)
    );

    await interaction.editReply({
      embeds: [embed],
      files: [attachment],
      components: [row],
    });
  } catch (err) {
    console.error("Showdown error:", err);
    await interaction.editReply({
      content: "Something went wrong starting the showdown. Try again!",
    });
  }
}
