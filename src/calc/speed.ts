import type { FieldState, PokemonState, SideState } from '../state/types';

const BOOSTS: ReadonlyArray<readonly [number, number]> = [
  [2, 8],
  [2, 7],
  [2, 6],
  [2, 5],
  [2, 4],
  [2, 3],
  [2, 2],
  [3, 2],
  [4, 2],
  [5, 2],
  [6, 2],
  [7, 2],
  [8, 2],
];

function chainMods(mods: number[]): number {
  let m = 4096;
  for (const mod of mods) {
    if (mod !== 4096) m = (m * mod + 2048) >> 12;
  }
  return Math.max(410, Math.min(131172, m));
}

function pokeRound(num: number): number {
  return num % 1 > 0.5 ? Math.ceil(num) : Math.floor(num);
}

export function boostedStat(stat: number, stages: number): number {
  const stage = Math.max(-6, Math.min(6, stages));
  const [num, den] = BOOSTS[6 + stage]!;
  return Math.floor((stat * num) / den);
}

/**
 * Dynamic speed the Null AI compares. Paralysis cuts speed by 75% (quarter speed).
 * Speed ties are not broken here; callers treat a tie as the AI moving first.
 */
export function dynamicSpeed(
  mon: PokemonState,
  raw: { atk: number; def: number; spa: number; spd: number; spe: number },
  field: FieldState,
  side: SideState,
): number {
  let speed = boostedStat(raw.spe, mon.boosts.spe);
  const mods: number[] = [];
  if (side.tailwind) mods.push(8192);
  const weather = field.weather;
  const ability = mon.ability;
  if (
    mon.unburdenActive ||
    (ability === 'Chlorophyll' && (weather === 'Sun' || weather === 'Harsh Sunshine')) ||
    (ability === 'Sand Rush' && weather === 'Sand') ||
    (ability === 'Swift Swim' && (weather === 'Rain' || weather === 'Heavy Rain')) ||
    (ability === 'Slush Rush' && (weather === 'Hail' || weather === 'Snow')) ||
    (ability === 'Surge Surfer' && field.terrain === 'Electric')
  ) {
    mods.push(8192);
  } else if (ability === 'Quick Feet' && mon.status) {
    mods.push(6144);
  } else if (ability === 'Slow Start' && mon.slowStart) {
    mods.push(2048);
  } else if (quarkSpeed(mon, field, raw)) {
    mods.push(6144);
  }
  if (mon.item === 'Choice Scarf' && !field.magicRoom) mods.push(6144);
  else if (mon.item === 'Iron Ball' && !field.magicRoom) mods.push(2048);
  else if (mon.item === 'Quick Powder' && mon.species === 'Ditto' && !field.magicRoom) mods.push(8192);
  speed = pokeRound((speed * chainMods(mods)) / 4096);
  if (mon.status === 'par' && ability !== 'Quick Feet') speed = Math.floor(speed * 25 / 100);
  return Math.max(0, speed);
}

function quarkSpeed(
  mon: PokemonState,
  field: FieldState,
  raw: { atk: number; def: number; spa: number; spd: number; spe: number },
): boolean {
  const proto = mon.ability === 'Protosynthesis' && (field.weather === 'Sun' || field.weather === 'Harsh Sunshine' || mon.item === 'Booster Energy');
  const quark = mon.ability === 'Quark Drive' && (field.terrain === 'Electric' || mon.item === 'Booster Energy');
  if (!proto && !quark) return false;
  const stats = (['atk', 'def', 'spa', 'spd', 'spe'] as const).map((stat) => boostedStat(raw[stat], mon.boosts[stat]));
  return stats[4] === Math.max(...stats);
}

/** The AI believes it wins speed ties. Trick Room reverses the stat comparison, and a tie still loses to that belief. */
export function aiMovesFirst(aiSpeed: number, playerSpeed: number, trickRoom: boolean): boolean {
  if (trickRoom) return aiSpeed < playerSpeed;
  return aiSpeed >= playerSpeed;
}
