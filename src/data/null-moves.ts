/** Published Pokémon Null move edits that change damage or the AI's move class. */

export const NULL_BASE_POWER: Record<string, number> = {
  'Double Slap': 20,
  'Comet Punch': 20,
  Absorb: 40,
  'Mega Drain': 60,
  'Arm Thrust': 25,
  Twineedle: 30,
  'Fury Attack': 20,
  'Fury Swipes': 20,
  'Triple Kick': 20,
  Octazooka: 80,
  'Disarming Voice': 60,
  Glaciate: 85,
  'Snap Trap': 80,
  'Grassy Glide': 70,
  'Triple Dive': 40,
  'Infernal Parade': 70,
  'Freezy Frost': 120,
  Return: 102,
  Frustration: 102,
  'Attack Order': 80,
  'Rock Climb': 80,
  Psystrike: 95,
  Aeroblast: 95,
  'Water Shuriken': 20,
  'Hidden Power': 60,
};

export const NULL_TYPE: Record<string, string> = {
  Covet: 'Fairy',
  'Rock Climb': 'Rock',
};

export const NULL_PRIORITY: Record<string, number> = {
  'Water Shuriken': 2,
};

/** Moves whose accuracy is 70 or lower, so a guaranteed secondary does not take the +6 status path. */
export const ACCURACY_AT_MOST_70 = new Set([
  'Zap Cannon',
  'Inferno',
  'Dynamic Punch',
  'Focus Blast',
  'Hurricane',
  'Thunder',
  'Grass Whistle',
]);

export const NEVER_HDM = new Set([
  'Explosion',
  'Self-Destruct',
  'Misty Explosion',
  'Final Gambit',
  'Meteor Beam',
  'Future Sight',
  'Feint',
  'Upper Hand',
  'Fissure',
  'Horn Drill',
  'Sheer Cold',
  'Guillotine',
]);

export const NO_KILL_BONUS = new Set([
  'Explosion',
  'Self-Destruct',
  'Misty Explosion',
  'Final Gambit',
  'Rollout',
  'Ice Ball',
  'Fissure',
  'Horn Drill',
  'Sheer Cold',
  'Guillotine',
]);

export const OHKO_MOVES = new Set(['Fissure', 'Horn Drill', 'Sheer Cold', 'Guillotine']);

export const PHAZING_MOVES = new Set(['Roar', 'Whirlwind', 'Dragon Tail', 'Circle Throw']);

export const PIVOT_MOVES = new Set(['U-turn', 'Volt Switch', 'Flip Turn', 'Parting Shot']);

export const CHOICE_STATUS_OK = new Set([
  'Memento',
  'Parting Shot',
  'Baton Pass',
  'Teleport',
  'Chilly Reception',
  'Sleep Talk',
  'Me First',
  'Copycat',
  'Mimic',
  'Transform',
  'Sketch',
  'Nature Power',
  'Assist',
  'Metronome',
]);

export const PROTECT_MOVES = new Set([
  'Protect',
  'Detect',
  'Spiky Shield',
  'Silk Trap',
  "King's Shield",
  'Baneful Bunker',
  'Obstruct',
  'Burning Bulwark',
  'Endure',
]);

export const SPEED_CONTROL = new Set([
  'Rock Tomb',
  'Glaciate',
  'Electroweb',
  'Icy Wind',
  'Mud Shot',
  'Bulldoze',
  'Low Sweep',
  'Drum Beating',
  'Pounce',
  'Bleakwind Storm',
]);

/** Utility moves that do not count as damaging for the Support class. */
export const SUPPORT_UTILITY = new Set([
  'Fake Out',
  'Feint',
  'Upper Hand',
  'Endeavor',
  'Super Fang',
  'Dragon Tail',
  'Circle Throw',
  'Knock Off',
  'Foul Play',
  'Future Sight',
  'Bug Bite',
  'Pollen Puff',
  ...SPEED_CONTROL,
]);

export const KILL_ABILITY = new Set(['Moxie', 'Beast Boost', 'Chilling Neigh', 'Grim Neigh']);

const HIDDEN_POWER_TYPES = [
  'Fighting',
  'Flying',
  'Poison',
  'Ground',
  'Rock',
  'Bug',
  'Ghost',
  'Steel',
  'Fire',
  'Water',
  'Grass',
  'Electric',
  'Psychic',
  'Ice',
  'Dragon',
  'Dark',
] as const;

export function hiddenPowerType(ivs: {
  hp: number;
  atk: number;
  def: number;
  spa: number;
  spd: number;
  spe: number;
}): string {
  const a = ivs.hp & 1;
  const b = ivs.atk & 1;
  const c = ivs.def & 1;
  const d = ivs.spe & 1;
  const e = ivs.spa & 1;
  const f = ivs.spd & 1;
  const index = Math.floor(((a + 2 * b + 4 * c + 8 * d + 16 * e + 32 * f) * 15) / 63);
  return HIDDEN_POWER_TYPES[index] ?? 'Dark';
}
