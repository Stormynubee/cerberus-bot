/**
 * Inferno Games event catalog — original Cerberus / HellCat / Greek-underworld flavor.
 * Structure inspired by classic Hunger Games simulators (bloodbath → day/night → feast),
 * but all narrative lines are original to this bot.
 */

export type ArenaPhase = "bloodbath" | "day" | "night" | "feast" | "finale";

export type EventKind =
  | "flavor"
  | "kill"
  | "trap"
  | "infect"
  | "spread"
  | "cure"
  | "suicide"
  | "environment";

export type ArenaEventDef = {
  id: string;
  phases: ArenaPhase[];
  kind: EventKind;
  /** How many living tributes are needed */
  actors: 1 | 2 | 3;
  /**
   * Template text. Placeholders: {0} {1} {2} for tribute display names.
   * Killer is usually {0}; victim often {1}.
   */
  text: string;
  /** Indices of actors who die (into the actors array) */
  deaths?: number[];
  /** Actor index who gets a kill credit (if a PvP kill) */
  killer?: number;
  /** Actor indices that become infected */
  infect?: number[];
  /** Actor indices that are cured */
  cure?: number[];
  weight?: number;
};

export const WEAPONS = [
  "none",
  "obsidian knife",
  "ashwood spear",
  "hellfire bow",
  "cerberus fang",
  "bronze shortsword",
  "trap kit",
  "poison vial",
] as const;

export type Weapon = (typeof WEAPONS)[number];

export const ARENA_EVENTS: ArenaEventDef[] = [
  // ——— BLOODBATH ———
  {
    id: "bb-grab-bag",
    phases: ["bloodbath"],
    kind: "flavor",
    actors: 2,
    text: "{0} and {1} sprint for the same supply bag. {0} rips it free; {1} slips in ash and retreats.",
    weight: 3,
  },
  {
    id: "bb-knife-kill",
    phases: ["bloodbath"],
    kind: "kill",
    actors: 2,
    text: "{0} snatches an obsidian knife from the Cornucopia and drives it into {1} before the horns finish echoing.",
    deaths: [1],
    killer: 0,
    weight: 2,
  },
  {
    id: "bb-trample",
    phases: ["bloodbath"],
    kind: "environment",
    actors: 1,
    text: "{0} is crushed in the opening stampede — the Inferno shows no mercy to the slow.",
    deaths: [0],
    weight: 1,
  },
  {
    id: "bb-spear",
    phases: ["bloodbath"],
    kind: "kill",
    actors: 2,
    text: "{0} hurls an ashwood spear through the smoke. It finds {1}'s chest. First blood of the Games.",
    deaths: [1],
    killer: 0,
    weight: 2,
  },
  {
    id: "bb-flee",
    phases: ["bloodbath"],
    kind: "flavor",
    actors: 1,
    text: "{0} ignores the Cornucopia entirely, vanishing into the black pines with empty hands and a living pulse.",
    weight: 3,
  },
  {
    id: "bb-triple",
    phases: ["bloodbath"],
    kind: "kill",
    actors: 3,
    text: "{0} turns the Cornucopia into a slaughterhouse — {1} falls, then {2}, while the crowd of ghosts howls.",
    deaths: [1, 2],
    killer: 0,
    weight: 1,
  },
  {
    id: "bb-wolf-edge",
    phases: ["bloodbath"],
    kind: "infect",
    actors: 1,
    text: "A hellhound lunges from the tree line as {0} reaches for a pack. Fangs pierce {0}'s arm — the bite burns like molten iron. Infection takes root.",
    infect: [0],
    weight: 2,
  },
  {
    id: "bb-trap-wire",
    phases: ["bloodbath"],
    kind: "trap",
    actors: 1,
    text: "{0} trips a wire at the Cornucopia rim. Spikes of bone erupt from the soil. The Games claim an early tribute.",
    deaths: [0],
    weight: 1,
  },

  // ——— DAY ———
  {
    id: "day-hunt",
    phases: ["day"],
    kind: "kill",
    actors: 2,
    text: "{0} tracks {1} through sulfur reeds and ends the chase with a clean strike. Another name for the kill board.",
    deaths: [1],
    killer: 0,
    weight: 2,
  },
  {
    id: "day-standoff",
    phases: ["day"],
    kind: "flavor",
    actors: 2,
    text: "{0} and {1} lock eyes across a ravine. Neither crosses. The Inferno will wait.",
    weight: 3,
  },
  {
    id: "day-alliance",
    phases: ["day"],
    kind: "flavor",
    actors: 2,
    text: "{0} and {1} share scorched rations and swear a temporary alliance. Trust is currency here — and it spends fast.",
    weight: 2,
  },
  {
    id: "day-betray",
    phases: ["day"],
    kind: "kill",
    actors: 2,
    text: "{0} waits until {1} sleeps in the shade… then finishes what the alliance started. Betrayal tastes like victory.",
    deaths: [1],
    killer: 0,
    weight: 2,
  },
  {
    id: "day-trap-pit",
    phases: ["day"],
    kind: "trap",
    actors: 1,
    text: "{0} steps onto false ground. A spike pit yawns open. Cerberus collects another soul.",
    deaths: [0],
    weight: 2,
  },
  {
    id: "day-trap-set",
    phases: ["day"],
    kind: "flavor",
    actors: 1,
    text: "{0} spends hours rigging a deadfall of basalt and rope. Somewhere, tomorrow's victim is already walking toward it.",
    weight: 2,
  },
  {
    id: "day-trap-sprung",
    phases: ["day"],
    kind: "trap",
    actors: 2,
    text: "{1} walks into {0}'s deadfall. Stone and rope do the rest. {0} doesn't even look back.",
    deaths: [1],
    killer: 0,
    weight: 2,
  },
  {
    id: "day-wolf-pack",
    phases: ["day"],
    kind: "infect",
    actors: 1,
    text: "Mutated wolves corner {0} at a dry creek. One bite is enough — black veins crawl up {0}'s neck.",
    infect: [0],
    weight: 2,
  },
  {
    id: "day-bow",
    phases: ["day"],
    kind: "kill",
    actors: 2,
    text: "{0}'s hellfire arrow finds {1} mid-sprint. The body hits ash before the scream finishes.",
    deaths: [1],
    killer: 0,
    weight: 2,
  },
  {
    id: "day-forage",
    phases: ["day"],
    kind: "flavor",
    actors: 1,
    text: "{0} digs up bitter roots and whispers thanks to whatever underworld god still listens.",
    weight: 3,
  },
  {
    id: "day-poison-berries",
    phases: ["day"],
    kind: "suicide",
    actors: 1,
    text: "{0} eats glowing berries that look like salvation. They are not. The arena keeps its secrets.",
    deaths: [0],
    weight: 1,
  },
  {
    id: "day-climb",
    phases: ["day"],
    kind: "flavor",
    actors: 1,
    text: "{0} climbs a scorched overlook and maps every plume of smoke. Knowledge is a weapon too.",
    weight: 2,
  },
  {
    id: "day-three-fight",
    phases: ["day"],
    kind: "kill",
    actors: 3,
    text: "A three-way brawl erupts. {0} survives. {1} and {2} do not. The flies arrive early.",
    deaths: [1, 2],
    killer: 0,
    weight: 1,
  },
  {
    id: "day-cure-herb",
    phases: ["day"],
    kind: "cure",
    actors: 1,
    text: "{0} chews a rare asphodel leaf. The black veins fade. Infection driven back — for now.",
    cure: [0],
    weight: 2,
  },
  {
    id: "day-taunt",
    phases: ["day"],
    kind: "flavor",
    actors: 1,
    text: "{0} carves a warning into bark: *THE ODDS ARE ASH.* Somewhere, Cerberus almost smiles.",
    weight: 2,
  },
  {
    id: "day-lava-edge",
    phases: ["day"],
    kind: "environment",
    actors: 1,
    text: "The arena floor cracks. {0} slips toward a lava seam and vanishes in a flare of white heat.",
    deaths: [0],
    weight: 1,
  },

  // ——— NIGHT ———
  {
    id: "night-ambush",
    phases: ["night"],
    kind: "kill",
    actors: 2,
    text: "Under a blood-red moon, {0} slips into {1}'s camp. Steel whispers. Silence follows.",
    deaths: [1],
    killer: 0,
    weight: 2,
  },
  {
    id: "night-fire",
    phases: ["night"],
    kind: "flavor",
    actors: 1,
    text: "{0} keeps a tiny fire alive and listens to distant screams like a lullaby from Hades.",
    weight: 3,
  },
  {
    id: "night-infection-death",
    phases: ["night"],
    kind: "environment",
    actors: 1,
    text: "The wolf-sickness peaks. {0} burns from the inside — eyes black, breath gone before dawn.",
    deaths: [0],
    weight: 3,
  },
  {
    id: "night-spread",
    phases: ["night"],
    kind: "spread",
    actors: 2,
    text: "Fever-mad, {0} claws at {1} in the dark. The bite transfers. Now two carry the Inferno's plague.",
    infect: [1],
    weight: 2,
  },
  {
    id: "night-trap-snare",
    phases: ["night"],
    kind: "trap",
    actors: 1,
    text: "{0} blunders into a hanging snare. Upside-down until the morning scavengers finish the job.",
    deaths: [0],
    weight: 2,
  },
  {
    id: "night-nightmare",
    phases: ["night"],
    kind: "flavor",
    actors: 1,
    text: "{0} wakes screaming from a dream of three-headed dogs. The dream was kinder than the arena.",
    weight: 2,
  },
  {
    id: "night-starvation",
    phases: ["night"],
    kind: "environment",
    actors: 1,
    text: "{0}'s body simply stops. Hunger, cold, and fear braid into one quiet ending.",
    deaths: [0],
    weight: 1,
  },
  {
    id: "night-explode",
    phases: ["night"],
    kind: "trap",
    actors: 2,
    text: "{0} detonates a cache of arena explosives near {1}'s shelter. Dawn will find only soot and a name on the dead list.",
    deaths: [1],
    killer: 0,
    weight: 1,
  },
  {
    id: "night-watch",
    phases: ["night"],
    kind: "flavor",
    actors: 2,
    text: "{0} and {1} take shifts on watch, whispering old stream jokes to stay awake. For a moment, they are human again.",
    weight: 2,
  },
  {
    id: "night-wolf-howl",
    phases: ["night"],
    kind: "infect",
    actors: 1,
    text: "Howls circle {0}'s tree. One wolf climbs. Teeth meet flesh. The infection signs its name in fever.",
    infect: [0],
    weight: 2,
  },
  {
    id: "night-mercy",
    phases: ["night"],
    kind: "kill",
    actors: 2,
    text: "{1} begs. {0} grants a quicker end than the arena would. Mercy, or just efficiency?",
    deaths: [1],
    killer: 0,
    weight: 1,
  },

  // ——— FEAST ———
  {
    id: "feast-rush",
    phases: ["feast"],
    kind: "kill",
    actors: 2,
    text: "The Feast table gleams. {0} and {1} collide over a med-kit. Only {0} walks away with it — and blood on their hands.",
    deaths: [1],
    killer: 0,
    weight: 3,
  },
  {
    id: "feast-poison",
    phases: ["feast"],
    kind: "trap",
    actors: 1,
    text: "{0} gulps a feast goblet laced with nightshade. The Gamemakers always tip the scales somehow.",
    deaths: [0],
    weight: 2,
  },
  {
    id: "feast-cure",
    phases: ["feast"],
    kind: "cure",
    actors: 1,
    text: "{0} snatches an antidote from the Feast and injects it mid-sprint. Black veins retreat. Second life unlocked.",
    cure: [0],
    weight: 2,
  },
  {
    id: "feast-steal",
    phases: ["feast"],
    kind: "flavor",
    actors: 1,
    text: "{0} grabs a pack and vanishes before the bloodbath at the table truly begins. Smart. Cowardly. Alive.",
    weight: 2,
  },
  {
    id: "feast-massacre",
    phases: ["feast"],
    kind: "kill",
    actors: 3,
    text: "The Feast becomes a massacre. {0} stands over {1} and {2}, chest heaving, crowned in ash.",
    deaths: [1, 2],
    killer: 0,
    weight: 2,
  },
  {
    id: "feast-wolf",
    phases: ["feast"],
    kind: "infect",
    actors: 1,
    text: "Hellhounds are released at the Feast perimeter. {0} escapes — but not unmarked. The bite sings infection.",
    infect: [0],
    weight: 2,
  },

  // ——— FINALE ———
  {
    id: "finale-duel",
    phases: ["finale"],
    kind: "kill",
    actors: 2,
    text: "Only two remain. {0} and {1} meet in the heart of the Inferno. Steel rings. {1} falls. The arena has its victor.",
    deaths: [1],
    killer: 0,
    weight: 5,
  },
  {
    id: "finale-trap",
    phases: ["finale"],
    kind: "trap",
    actors: 2,
    text: "In the final stretch, {1} triggers {0}'s last trap. One tribute. One crown. One silence.",
    deaths: [1],
    killer: 0,
    weight: 3,
  },
  {
    id: "finale-infection",
    phases: ["finale"],
    kind: "environment",
    actors: 2,
    text: "Infection claims {1} at the finish line. {0} watches the fever take their last rival — victory by plague.",
    deaths: [1],
    killer: 0,
    weight: 2,
  },
  {
    id: "finale-speech",
    phases: ["finale"],
    kind: "flavor",
    actors: 2,
    text: "{0} and {1} circle each other. \"May the odds,\" {0} spits, \"burn.\" The final blow is coming.",
    weight: 2,
  },
];

/** Cheeky one-liners injected between events for flavor */
export const BANTER_LINES = [
  "Cerberus tilts all three heads. Someone's luck just expired.",
  "Somewhere in the skybox, GreekGodBerry laughs into the mic.",
  "The Inferno doesn't do plot armor. It does body counts.",
  "HellCatCoins can't buy you breath — but they can buy the winner glory.",
  "A sponsor drone buzzes overhead… then thinks better of it.",
  "Odds update: terrible, worsening, and *chef's kiss* catastrophic.",
  "The mutts are hungry. So is the audience.",
  "Hades sends his regards. They're not friendly.",
  "Remember: alliances are just murder with extra steps.",
  "Ash falls like confetti. Nobody's celebrating yet.",
  "The Cornucopia still smells like panic.",
  "Night thickens. So do the body bags.",
  "Infection doesn't negotiate. Neither does Cerberus.",
  "One more sunrise. Maybe. Probably not for everyone.",
  "The arena shrinks. The drama doesn't.",
];

export function fillTemplate(text: string, names: string[]): string {
  return text.replace(/\{(\d+)\}/g, (_, idx) => names[Number(idx)] ?? "?");
}

export function pickWeighted<T extends { weight?: number }>(items: T[]): T {
  const total = items.reduce((s, i) => s + (i.weight ?? 1), 0);
  let roll = Math.random() * total;
  for (const item of items) {
    roll -= item.weight ?? 1;
    if (roll <= 0) return item;
  }
  return items[items.length - 1]!;
}
