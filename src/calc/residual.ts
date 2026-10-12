import { maxHpOf, typesOf } from './damage';
import type { PokemonState } from '../state/types';

export interface ResidualChoice {
  sand: boolean;
  hail: boolean;
  status: boolean;
  leechSeed: boolean;
}

export interface ResidualPart {
  label: string;
  amount: number;
}

/** End-of-turn chip on the player. A checked source applies even when that weather is not currently up. */
export function residualChip(mon: PokemonState, choice: ResidualChoice): ResidualPart[] {
  if (mon.ability === 'Magic Guard') return [];
  const max = maxHpOf(mon);
  const parts: ResidualPart[] = [];
  if (choice.sand) parts.push({ label: 'Sandstorm', amount: weatherChip(mon, max, 'sand') });
  if (choice.hail) parts.push({ label: 'Hail', amount: weatherChip(mon, max, 'hail') });
  if (choice.status && mon.status === 'brn') parts.push({ label: 'Burn', amount: burnChip(mon, max) });
  if (choice.status && mon.status === 'psn') parts.push({ label: 'Poison', amount: Math.floor(max / 8) });
  if (choice.status && mon.status === 'tox') parts.push({ label: 'Toxic', amount: Math.max(1, Math.floor(max / 16)) });
  if (choice.leechSeed && mon.leechSeeded) parts.push({ label: 'Leech Seed', amount: Math.floor(max / 8) });
  return parts.filter((part) => part.amount > 0);
}

function weatherChip(mon: PokemonState, max: number, kind: 'sand' | 'hail'): number {
  if (mon.item === 'Safety Goggles' || mon.ability === 'Overcoat') return 0;
  const types = typesOf(mon);
  if (kind === 'sand') {
    if (types.some((type) => type === 'Rock' || type === 'Ground' || type === 'Steel')) return 0;
    if (mon.ability === 'Sand Veil' || mon.ability === 'Sand Rush' || mon.ability === 'Sand Force') return 0;
  } else if (types.includes('Ice') || mon.ability === 'Ice Body' || mon.ability === 'Snow Cloak') return 0;
  return Math.max(1, Math.floor(max / 16));
}

function burnChip(mon: PokemonState, max: number): number {
  const chip = Math.floor(max / 16);
  if (mon.ability === 'Heatproof') return Math.floor(chip / 2);
  return chip;
}
