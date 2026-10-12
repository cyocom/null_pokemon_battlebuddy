import { calculate, Field, Generations, Move, Pokemon, toID } from '@smogon/calc';
import { hiddenPowerType, NULL_BASE_POWER, NULL_PRIORITY, NULL_TYPE } from '../data/null-moves';
import type { FieldState, PokemonState, SideState } from '../state/types';
import { dynamicSpeed } from './speed';

export const gen = Generations.get(9);

export interface RollWeight {
  damage: number;
  p: number;
}

export interface DamageEstimate {
  rolls: number[];
  weights: RollWeight[];
  min: number;
  max: number;
  mean: number;
  priority: number;
  category: 'Physical' | 'Special' | 'Status';
  type: string;
  bp: number;
  hits: number;
}

const TERRAIN_BOOST = 1.5 / 1.3;

export function speciesKnown(name: string): boolean {
  return Boolean(name && gen.species.get(toID(name)));
}

export function moveKnown(name: string): boolean {
  return Boolean(name && gen.moves.get(toID(name)));
}

export function toId(name: string): string {
  return toID(name);
}

export function maxHpOf(mon: PokemonState): number {
  if (!speciesKnown(mon.species)) return Math.max(1, mon.curHp);
  return toCalcMon(mon).maxHP();
}

export function rawSpeedOf(mon: PokemonState): number {
  if (!speciesKnown(mon.species)) return 0;
  return toCalcMon(mon).rawStats.spe;
}

export function rawStatsOf(mon: PokemonState): { atk: number; def: number; spa: number; spd: number; spe: number } {
  const poke = toCalcMon(mon);
  return {
    atk: poke.rawStats.atk,
    def: poke.rawStats.def,
    spa: poke.rawStats.spa,
    spd: poke.rawStats.spd,
    spe: poke.rawStats.spe,
  };
}

export function speedOf(mon: PokemonState, field: FieldState, side: SideState): number {
  if (!speciesKnown(mon.species)) return 0;
  return dynamicSpeed(mon, rawStatsOf(mon), field, side);
}

export function typesOf(mon: PokemonState): string[] {
  if (!speciesKnown(mon.species)) return [];
  return [...toCalcMon(mon).types];
}

export function moveMeta(name: string, user?: PokemonState): { bp: number; priority: number; category: 'Physical' | 'Special' | 'Status'; type: string; hits: number; multihit: boolean } {
  const data = gen.moves.get(toID(name));
  if (!data) return { bp: 0, priority: 0, category: 'Status', type: 'Normal', hits: 1, multihit: false };
  const variable = Array.isArray(data.multihit);
  let hits = 1;
  if (typeof data.multihit === 'number') hits = data.multihit;
  else if (variable) {
    if (user?.ability === 'Skill Link') hits = 5;
    else if (user?.item === 'Loaded Dice') hits = 4;
    else hits = 3;
  }
  let type = NULL_TYPE[data.name] ?? data.type;
  if (data.name === 'Hidden Power' && user) type = hiddenPowerType(user.ivs);
  return {
    bp: NULL_BASE_POWER[data.name] ?? data.basePower,
    priority: NULL_PRIORITY[data.name] ?? data.priority ?? 0,
    category: data.category ?? 'Status',
    type,
    hits,
    multihit: variable,
  };
}

/**
 * Protean and Libero change the user into the move's type, and that type stays until it moves again.
 * A type chosen in the dropdown is the current type and is left alone.
 */
export function applyProtean(mon: PokemonState, move: string): PokemonState {
  if (mon.types?.length || (mon.ability !== 'Protean' && mon.ability !== 'Libero') || !move) return mon;
  const type = moveMeta(move, mon).type;
  if (!type) return mon;
  return { ...mon, types: [type] };
}

export function estimateDamage(attacker: PokemonState, defender: PokemonState, moveName: string, field: FieldState, attackerSide: SideState, defenderSide: SideState): DamageEstimate {
  const meta = moveMeta(moveName, attacker);
  const empty: DamageEstimate = { rolls: [0], weights: [{ damage: 0, p: 1 }], min: 0, max: 0, mean: 0, ...meta };
  if (!moveName || meta.category === 'Status' || !speciesKnown(attacker.species) || !speciesKnown(defender.species) || !moveKnown(moveName)) {
    return empty;
  }
  if (defender.fainted || defender.curHp <= 0) return empty;

  const atk = toCalcMon(attacker);
  const def = toCalcMon(defender);
  // Null paralysis is a 75% speed cut. The gen 9 calc uses 50%, so halve the raw speed and let it cut again.
  if (attacker.status === 'par' && attacker.ability !== 'Quick Feet') atk.rawStats.spe = Math.floor(atk.rawStats.spe / 2);
  if (defender.status === 'par' && defender.ability !== 'Quick Feet') def.rawStats.spe = Math.floor(def.rawStats.spe / 2);
  if (attacker.status === 'frb') atk.rawStats.spa = Math.floor(atk.rawStats.spa / 2);
  if (defender.status === 'frb') def.rawStats.spa = Math.floor(def.rawStats.spa / 2);
  if (moveName === 'Explosion' || moveName === 'Self-Destruct') def.rawStats.def = Math.max(1, Math.floor(def.rawStats.def / 2));
  if (moveName === 'Misty Explosion') def.rawStats.spd = Math.max(1, Math.floor(def.rawStats.spd / 2));

  const weather = moveName === 'Hydro Steam' && field.weather === 'Harsh Sunshine' ? 'Sun' : field.weather;
  const calcField = new Field({
    gameType: 'Singles',
    weather: weather || undefined,
    terrain: field.terrain || undefined,
    isGravity: field.gravity,
    isWonderRoom: field.wonderRoom,
    isMagicRoom: field.magicRoom,
    attackerSide: toCalcSide(attackerSide),
    defenderSide: toCalcSide(defenderSide),
  });
  const move = new Move(gen, moveName, {
    hits: meta.hits,
    overrides: {
      basePower: meta.bp,
      type: meta.type as 'Normal',
      priority: meta.priority,
    },
  });
  let result;
  try {
    result = calculate(gen, atk, def, move, calcField);
  } catch {
    return empty;
  }
  let rolls = flattenRolls(result.damage);
  if (attacker.species.startsWith('Castform') && moveName === 'Weather Ball') {
    rolls = rolls.map((roll) => Math.floor(roll * 1.5));
  }
  if (terrainBoosts(attacker, meta.type, field)) {
    rolls = rolls.map((roll) => Math.floor(roll * TERRAIN_BOOST));
  }
  if ((field.mudSport && meta.type === 'Electric') || (field.waterSport && meta.type === 'Fire')) {
    rolls = rolls.map((roll) => Math.floor(roll / 2));
  }
  if (!rolls.length) rolls = [0];
  return { rolls, weights: weigh(rolls), min: Math.min(...rolls), max: Math.max(...rolls), mean: avg(rolls), ...meta };
}

export function hitsToKo(estimate: DamageEstimate, hp: number, extraHits = 0): number {
  if (estimate.mean <= 0 || hp <= 0) return 99;
  return Math.ceil(hp / estimate.mean) + extraHits;
}

export function koChance(rolls: number[], hp: number): number {
  if (hp <= 0) return 1;
  if (!rolls.length) return 0;
  return rolls.filter((roll) => roll >= hp).length / rolls.length;
}

function terrainBoosts(attacker: PokemonState, type: string, field: FieldState): boolean {
  if (field.terrain === 'Electric' && type !== 'Electric') return false;
  if (field.terrain === 'Grassy' && type !== 'Grass') return false;
  if (field.terrain === 'Psychic' && type !== 'Psychic') return false;
  if (field.terrain !== 'Electric' && field.terrain !== 'Grassy' && field.terrain !== 'Psychic') return false;
  if (field.gravity) return true;
  const types = typesOf(attacker);
  if (types.includes('Flying')) return false;
  if (attacker.ability === 'Levitate' && attacker.item !== 'Iron Ball') return false;
  if (attacker.item === 'Air Balloon') return false;
  return true;
}

function flattenRolls(damage: number | number[] | [number, number] | [number[], number[]]): number[] {
  if (typeof damage === 'number') return [damage];
  if (!Array.isArray(damage) || damage.length === 0) return [0];
  if (typeof damage[0] === 'number') return damage as number[];
  const [first, second] = damage as [number[], number[]];
  return first.map((roll, index) => roll + (second[index] ?? 0));
}

function weigh(rolls: number[]): RollWeight[] {
  const counts = new Map<number, number>();
  for (const roll of rolls) counts.set(roll, (counts.get(roll) ?? 0) + 1);
  return [...counts.entries()].map(([damage, count]) => ({ damage, p: count / rolls.length }));
}

function avg(rolls: number[]): number {
  return rolls.reduce((sum, roll) => sum + roll, 0) / rolls.length;
}

function toCalcMon(mon: PokemonState): Pokemon {
  const status = mon.status === 'frb' ? '' : mon.status;
  const poke = new Pokemon(gen, mon.species, {
    level: mon.level,
    ability: mon.ability || undefined,
    abilityOn: mon.unburdenActive || mon.slowStart,
    item: mon.item || undefined,
    nature: mon.nature || 'Serious',
    ivs: mon.ivs,
    evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    boosts: {
      atk: mon.boosts.atk,
      def: mon.boosts.def,
      spa: mon.boosts.spa,
      spd: mon.boosts.spd,
      spe: mon.boosts.spe,
    },
    status: status || undefined,
    curHP: Math.max(1, mon.curHp),
    moves: mon.moves,
    isSaltCure: false,
  });
  if (mon.types?.length) {
    // A single changed type has to fill both slots. The calc clones by merging onto the species types, so a one-type list would leave the old second type behind.
    const changed = (mon.types.length === 1 ? [mon.types[0]!, '???'] : mon.types.slice(0, 2)) as typeof poke.types;
    poke.types = changed;
    (poke.species as { types: typeof poke.types }).types = changed;
  }
  return poke;
}

function toCalcSide(side: SideState) {
  return {
    isSR: side.stealthRock,
    spikes: side.spikes,
    isReflect: side.reflect,
    isLightScreen: side.lightScreen,
    isAuroraVeil: side.auroraVeil,
    isTailwind: side.tailwind,
    isSeeded: false,
  };
}
