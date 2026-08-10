import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import { AVATAR_PATH } from "../services/branding.js";
import { theme } from "../theme.js";
import { baseEmbed } from "../utils/embeds.js";

export const data = new SlashCommandBuilder()
  .setName("hell")
  .setDescription("GreekBot help — HellCatCoins games & wallet");

type HelpTab = "home" | "wallet" | "pvp" | "casino" | "inferno" | "admin";

const TABS: Record<
  HelpTab,
  { label: string; title: string; color: number; body: string }
> = {
  home: {
    label: "Home",
    title: `${theme.emojis.fire} GreekBot — HellCat Games`,
    color: theme.colors.inferno,
    body:
      "GreekBot for the **GreekGodBerry** community. Stack **HellCatCoins**, duel friends, and survive the Inferno.\n\n" +
      "Tap a category below — every game uses buttons & live embeds.\n\n" +
      "Site: https://www.greekgambles.com/\n\n" +
      "Wagers are virtual entertainment currency only. 18+.",
  },
  wallet: {
    label: "Wallet",
    title: `${theme.emojis.coin} Wallet`,
    color: theme.colors.gold,
    body:
      "`/balance` — check your HellCatCoins\n" +
      "`/daily` — claim streak reward\n" +
      "`/tip` — send HCC to a friend\n" +
      "`/leaderboard` — top wallets + jackpot\n" +
      "`/profile` — combat & arena stats\n" +
      "`/jackpot` — progressive jackpot pool",
  },
  pvp: {
    label: "PvP",
    title: `${theme.emojis.swords} PvP & Table`,
    color: theme.colors.danger,
    body:
      "`/coinflip` — house spin or challenge a player (Accept / Decline)\n" +
      "`/rps` — Rock–Paper–Scissors duel with live picks\n" +
      "`/blackjack` — Hit / Stand vs the house\n\n" +
      "Challenges expire automatically; escrow is refunded.",
  },
  casino: {
    label: "Casino",
    title: `${theme.emojis.spin} Casino`,
    color: theme.colors.inferno,
    body:
      "`/slots` — 3-reel Inferno slots\n" +
      "`/roulette` — red / black / green\n" +
      "`/crash` — ride the rocket, cash out before it blows\n" +
      "`/highlow` — climb the card ladder\n\n" +
      "Big wins can post to your configured feed channel.",
  },
  inferno: {
    label: "Inferno",
    title: `${theme.emojis.skull} Inferno Games`,
    color: theme.colors.night,
    body:
      "`/hungergames new` — open signup (optional entry → prize pool)\n" +
      "`/hungergames status` — alive / dead / infected\n\n" +
      "**Flow:** Join → Start → Bloodbath → Day/Night → Feast → Finale\n\n" +
      "Wolf bites infect · traps kill · phase casualty reports · Arena Master can start/cancel",
  },
  admin: {
    label: "Admin",
    title: "⚙️ Admin (Manage Server)",
    color: theme.colors.muted,
    body:
      "`/admin grant|revoke|freeze|audit` — economy tools\n" +
      "`/admin bigwin` — big-win feed channel + threshold\n" +
      "`/admin arenamaster` — role that can start/cancel Inferno Games",
  },
};

function helpEmbed(tab: HelpTab): EmbedBuilder {
  const t = TABS[tab];
  return baseEmbed(t.color)
    .setTitle(t.title)
    .setDescription(t.body)
    .setThumbnail("attachment://greekbot-avatar.png")
    .setFooter({ text: theme.footer });
}

function logoAttachment(): AttachmentBuilder {
  return new AttachmentBuilder(AVATAR_PATH, { name: "greekbot-avatar.png" });
}

function helpRows(active: HelpTab): ActionRowBuilder<ButtonBuilder>[] {
  const mk = (id: HelpTab, style: ButtonStyle = ButtonStyle.Secondary) =>
    new ButtonBuilder()
      .setCustomId(`hell:${id}`)
      .setLabel(TABS[id].label)
      .setStyle(id === active ? ButtonStyle.Primary : style)
      .setDisabled(id === active);

  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      mk("home", ButtonStyle.Success),
      mk("wallet"),
      mk("pvp"),
      mk("casino"),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      mk("inferno", ButtonStyle.Danger),
      mk("admin"),
    ),
  ];
}

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.reply({
    embeds: [helpEmbed("home")],
    components: helpRows("home"),
    files: [logoAttachment()],
    flags: MessageFlags.Ephemeral,
  });
}

export async function handleHelpButton(interaction: ButtonInteraction) {
  const tab = interaction.customId.slice("hell:".length) as HelpTab;
  if (!TABS[tab]) {
    await interaction.reply({
      content: "Unknown help tab.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.update({
    embeds: [helpEmbed(tab)],
    components: helpRows(tab),
  });
}
