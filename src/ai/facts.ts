import type { DamageEstimate } from '../calc/damage';
import type { FieldState, PokemonState, SideState } from '../state/types';

export interface ScoreFacts {
  ai: PokemonState;
  player: PokemonState;
  field: FieldState;
  aiSide: SideState;
  playerSide: SideState;
  move: string;
  category: 'Physical' | 'Special' | 'Status';
  type: string;
  bp: number;
  priority: number;
  hits: number;
  /** This damage roll. Status moves stay at 0. */
  damage: number;
  isHdm: boolean;
  /** This roll KOs through substitute and an intact disguise. */
  kills: boolean;
  aiFirst: boolean;
  playerCanFaint: boolean;
  /** Mean hits for the player to KO the AI, with disguise and substitute. */
  playerHits: number;
  /** Player moves first on speed alone and KOs in two hits. */
  playerFastTwoHit: boolean;
  /** Some AI attack's max roll KOs. */
  aiMaxKills: boolean;
  /** Mean hits for this move to KO the player. */
  moveHits: number;
  aiLastMon: boolean;
  playerLastMon: boolean;
  incapacitated: boolean;
  playerPhysical: boolean;
  playerSpecial: boolean;
  aiTypes: string[];
  playerTypes: string[];
  aiMaxHp: number;
  playerMaxHp: number;
  /** Paralysis would turn a speed deficit into a lead. */
  paraFlipsSpeed: boolean;
  allyLowHp: boolean;
  partyStatus: boolean;
  estimate: DamageEstimate;
}

export function hasMove(mon: PokemonState, ...names: string[]): boolean {
  return names.some((name) => mon.moves.includes(name));
}

export function hasAny(mon: PokemonState, names: ReadonlySet<string> | readonly string[]): boolean {
  const set = names instanceof Set ? names : new Set(names);
  return mon.moves.some((move) => set.has(move));
}
