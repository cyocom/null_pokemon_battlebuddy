import { toID } from '@smogon/calc';
import { gen, maxHpOf, typesOf } from './damage';
import type { PokemonState, SideState } from '../state/types';

export function hazardDamage(mon: PokemonState, side: SideState): number {
  if (mon.item === 'Heavy-Duty Boots') return 0;
  const types = typesOf(mon);
  const hp = maxHpOf(mon);
  let damage = 0;
  if (side.stealthRock) damage += Math.floor((hp * typeEffectiveness('Rock', types)) / 8);
  if (side.spikes > 0 && grounded(mon, types)) {
    const fraction = side.spikes >= 3 ? 1 / 4 : side.spikes === 2 ? 1 / 6 : 1 / 8;
    damage += Math.floor(hp * fraction);
  }
  return damage;
}

function grounded(mon: PokemonState, types: string[]): boolean {
  if (mon.item === 'Iron Ball') return true;
  if (types.includes('Flying')) return false;
  if (mon.ability === 'Levitate') return false;
  if (mon.item === 'Air Balloon') return false;
  return true;
}

function typeEffectiveness(attack: string, defenderTypes: string[]): number {
  const chart = gen.types.get(toID(attack));
  if (!chart) return 1;
  return defenderTypes.reduce((mod, type) => mod * (chart.effectiveness[type as 'Normal'] ?? 1), 1);
}
