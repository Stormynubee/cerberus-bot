import { existsSync } from "node:fs";
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
      "Duels use **buttons**. Both players escrow coins; the loser is burned, winner takes the pot (**no house rake** on PvP).\n" +
      "Expired / declined challenges **auto-refund**.",
    steps: [
      "`/coinflip amount heads|tails` — vs house (2% rake on wins), or add `@opponent` (rake-free pot)",
      "Opponent taps **Accept** / **Decline** on the challenge message",
      "`/rps @opponent amount` — fair Rock / Paper / Scissors; both pick privately",
      "`/blackjack amount` — **Hit** / **Stand** vs the house (stands on all 17)",
      "Only one open duel at a time per player",
    ],
    tryNext: "`/coinflip 50 heads` or challenge a friend",
  },
  casino: {
    label: "Casino",
    title: `${theme.emojis.spin} Casino guide`,
    color: theme.colors.inferno,
    gif: "casino.gif",
    body:
      "Solo games vs GreekBot. Watch the live embeds — some rounds need a **Cash Out** button.\n" +
      "House games disclose their edge: typically **~2% rake on wins** (jackpot-bound).",
    steps: [
      "`/slots amount` — 3-reel Inferno spin",
      "`/roulette amount red|black|green` — green pays **36x** (European-style)",
      "`/crash amount` — Bustabit-style curve; **3%** instant 1.00x; cash out before it blows",
      "`/highlow amount` — Higher / Lower pays **true remaining-deck odds** (−3% edge)",
      "`/coinflip amount heads|tails` — fair 50/50 vs house (2% rake on wins)",
      "`/blackjack amount` — dealer stands on all 17; no double/split",
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
      "Hunger-Games style **story arena**: weighted events and forced kills keep the plot moving — " +
      "it is not a pure survival lottery. Early deaths are expected.\n" +
      "The host **pays the base prize** when opening a round (refunded if cancelled); entry fees add to the pool.",
    steps: [
      "Mods: `/hungergames setup win_prize:250 revive_cost:50 max_revives:2`",
      "Host: `/hungergames new` (uses server defaults — host must afford the base prize)",
      "Everyone taps **Join** on the signup message",
      "Host / Arena Master / mods tap **Start** (min players required)",
      "Dead tributes can **Revive** (default 50 HCC, max 2) between phases",
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
      "`/admin arenamaster @role` — optional Arena Master (Verified is auto-set)",
      "Inferno Games: Verified + @everyone can host when public arena is on",
    ],
    tryNext: "Set `/admin arenamaster` before the first arena",
  },
};

export function helpEmbed(tab: HelpTab, botAvatarUrl?: string | null): EmbedBuilder {
  const t = TABS[tab];
  const steps = t.steps.map((s, i) => `**${i + 1}.** ${s}`).join("\n");
  const embed = baseEmbed(t.color)
    .setTitle(t.title)
    .setDescription(`${t.body}\n\n**How to play**\n${steps}\n\n**Try next:** ${t.tryNext}`);

  // Prefer Discord CDN avatar — never attach the multi‑MB local PNG (causes /help timeouts).
  if (botAvatarUrl) {
    embed.setThumbnail(botAvatarUrl);
  }
  if (existsSync(path.join(GIF_DIR, t.gif))) {
    embed.setImage(`attachment://${t.gif}`);
  }
  return embed;
}

export function helpFiles(tab: HelpTab): AttachmentBuilder[] {
  const files: AttachmentBuilder[] = [];
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
  // Ack within 3s — GIF upload can be slow on cold hosts.
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  }

  const avatar = interaction.client.user?.displayAvatarURL({ size: 128 }) ?? null;
  try {
    await interaction.editReply({
      embeds: [helpEmbed(tab, avatar)],
      components: helpRows(tab),
      files: helpFiles(tab),
    });
  } catch (err) {
    console.warn("[help] reply with gif failed, falling back to text-only", err);
    const fallback = helpEmbed(tab, avatar);
    fallback.setImage(null);
    await interaction.editReply({
      embeds: [fallback],
      components: helpRows(tab),
      files: [],
    });
  }
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

  const avatar = interaction.client.user?.displayAvatarURL({ size: 128 }) ?? null;
  try {
    await interaction.update({
      embeds: [helpEmbed(tab, avatar)],
      components: helpRows(tab),
      files: helpFiles(tab),
    });
  } catch (err) {
    console.warn("[help] tab update failed", err);
    await interaction
      .update({
        embeds: [helpEmbed(tab, avatar)],
        components: helpRows(tab),
        files: [],
      })
      .catch(() => undefined);
  }
}
