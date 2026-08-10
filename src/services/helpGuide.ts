import { accessSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
} from "discord.js";
import { AVATAR_PATH } from "../services/branding.js";
import { theme } from "../theme.js";
import { baseEmbed } from "../utils/embeds.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const GIF_DIR = path.resolve(__dirname, "../../assets/gifs");

export type HelpTab = "home" | "wallet" | "pvp" | "casino" | "inferno" | "admin";

type TabContent = {
  label: string;
  title: string;
  color: number;
  gif: string;
  body: string;
  steps: string[];
  tryNext: string;
};

export const TABS: Record<HelpTab, TabContent> = {
  home: {
    label: "Start",
    title: `${theme.emojis.fire} GreekBot — Start here`,
    color: theme.colors.inferno,
    gif: "home.gif",
    body:
      "Welcome to **GreekBot** for the GreekGodBerry community.\n" +
      "Everything runs on virtual **HellCatCoins** (entertainment only · 18+).\n\n" +
      "Use the buttons below — each tab has a **guide GIF** + exact commands.",
    steps: [
      "Claim `/daily` so you have coins to play",
      "Try a quick `/slots` or `/coinflip` vs the house",
      "Challenge a friend with `/rps` or `/coinflip`",
      "When the lobby opens, Join **Inferno Games**",
    ],
    tryNext: "`/daily` → then open **Wallet** or **Casino**",
  },
  wallet: {
    label: "Wallet",
    title: `${theme.emojis.coin} Wallet guide`,
    color: theme.colors.gold,
    gif: "wallet.gif",
    body: "Your HellCatCoins live on your Discord wallet. No crypto — pure server fun.",
    steps: [
      "`/daily` — claim once per day (streak bonus)",
      "`/balance` — see your stack",
      "`/tip @user amount` — send HCC to a friend",
      "`/leaderboard` — top wallets + jackpot peek",
      "`/profile` — wins, losses, streaks",
      "`/jackpot` — progressive house pot",
    ],
    tryNext: "Run `/daily` now, then open **Casino**",
  },
  pvp: {
    label: "PvP",
    title: `${theme.emojis.swords} PvP & table guide`,
    color: theme.colors.danger,
    gif: "pvp.gif",
    body:
      "Duels use **buttons**. Both players escrow coins; the loser is burned, winner takes the pot.\n" +
      "Expired / declined challenges **auto-refund**.",
    steps: [
      "`/coinflip amount heads|tails` — vs house, or add `@opponent`",
      "Opponent taps **Accept** / **Decline** on the challenge message",
      "`/rps @opponent amount` — both pick Rock / Paper / Scissors privately",
      "`/blackjack amount` — **Hit** / **Stand** vs the house",
      "Only one open duel at a time per player",
    ],
    tryNext: "`/coinflip 50 heads` or challenge a friend",
  },
  casino: {
    label: "Casino",
    title: `${theme.emojis.spin} Casino guide`,
    color: theme.colors.inferno,
    gif: "casino.gif",
    body: "Solo games vs GreekBot. Watch the live embeds — some rounds need a **Cash Out** button.",
    steps: [
      "`/slots amount` — 3-reel Inferno spin",
      "`/roulette amount red|black|green` — green pays big",
      "`/crash amount` — rocket climbs; tap **Cash Out** before it blows",
      "`/highlow amount` — Higher / Lower / Cash Out on the climb",
      "Big wins can post to the server feed (admins set `/admin bigwin`)",
    ],
    tryNext: "`/slots 25` or `/crash 50`",
  },
  inferno: {
    label: "Inferno",
    title: `${theme.emojis.skull} Inferno Games guide`,
    color: theme.colors.night,
    gif: "inferno.gif",
    body:
      "Hunger-Games style arena with **cool HellCat** chaos: wolf bites, traps, night infection, casualty reports.",
    steps: [
      "Host: `/hungergames new` (optional entry fee → prize pool)",
      "Everyone taps **Join** on the signup message",
      "Host / Arena Master / mods tap **Start** (min players required)",
      "Phases: Bloodbath → Day/Night → Feast → Finale",
      "`/hungergames status` — alive / dead / infected mid-match",
      "Last tribute standing wins the prize pool",
    ],
    tryNext: "Ask a mod to open `/hungergames new`",
  },
  admin: {
    label: "Admin",
    title: "⚙️ Admin guide",
    color: theme.colors.muted,
    gif: "admin.gif",
    body: "Requires **Manage Server**. Economy tools + arena controls.",
    steps: [
      "`/admin grant @user amount` — add HCC",
      "`/admin revoke @user amount` — remove HCC",
      "`/admin freeze @user` — lock a wallet",
      "`/admin audit @user` — recent ledger",
      "`/admin bigwin #channel threshold` — highlight feed",
      "`/admin arenamaster @role` — who can start/cancel Inferno",
    ],
    tryNext: "Set `/admin arenamaster` before the first arena",
  },
};

function logoAvailable(): boolean {
  try {
    accessSync(AVATAR_PATH);
    return true;
  } catch {
    return false;
  }
}

export function helpEmbed(tab: HelpTab): EmbedBuilder {
  const t = TABS[tab];
  const steps = t.steps.map((s, i) => `**${i + 1}.** ${s}`).join("\n");
  const embed = baseEmbed(t.color)
    .setTitle(t.title)
    .setDescription(`${t.body}\n\n### How to play\n${steps}\n\n**Try next:** ${t.tryNext}`)
    .setFooter({ text: theme.footer });

  if (logoAvailable()) {
    embed.setThumbnail("attachment://greekbot-avatar.png");
  }
  if (existsSync(path.join(GIF_DIR, t.gif))) {
    embed.setImage(`attachment://${t.gif}`);
  }
  return embed;
}

export function helpFiles(tab: HelpTab): AttachmentBuilder[] {
  const files: AttachmentBuilder[] = [];
  if (logoAvailable()) {
    files.push(new AttachmentBuilder(AVATAR_PATH, { name: "greekbot-avatar.png" }));
  }
  const gifPath = path.join(GIF_DIR, TABS[tab].gif);
  if (existsSync(gifPath)) {
    files.push(new AttachmentBuilder(gifPath, { name: TABS[tab].gif }));
  }
  return files;
}

export function helpRows(active: HelpTab): ActionRowBuilder<ButtonBuilder>[] {
  const mk = (id: HelpTab, style: ButtonStyle = ButtonStyle.Secondary) =>
    new ButtonBuilder()
      .setCustomId(`help:${id}`)
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

export async function replyHelp(
  interaction: ChatInputCommandInteraction,
  tab: HelpTab = "home",
) {
  await interaction.reply({
    embeds: [helpEmbed(tab)],
    components: helpRows(tab),
    files: helpFiles(tab),
    flags: MessageFlags.Ephemeral,
  });
}

export async function handleHelpButton(interaction: ButtonInteraction) {
  const raw = interaction.customId.replace(/^(help|hell):/, "");
  const tab = raw as HelpTab;
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
    files: helpFiles(tab),
  });
}
