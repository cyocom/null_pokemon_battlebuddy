import type { PlayerSide, PokemonState } from './types';

export const PARTY_LIMIT = 6;

/** Moves a boxed Pokémon into the battle party. Party entries are the same object as the box entry. */
export function addBoxMonToParty(player: PlayerSide, mon: PokemonState): string | null {
  if (!player.box.includes(mon)) return 'That Pokémon is not in your box.';
  if (player.party.includes(mon)) return 'Already in your party.';
  if (player.party.length >= PARTY_LIMIT) return 'Your party already has 6 Pokémon.';
  player.party.push(mon);
  return null;
}

/** Takes a Pokémon out of the battle party. It stays in the box. */
export function removeFromParty(player: PlayerSide, mon: PokemonState): void {
  const index = player.party.indexOf(mon);
  if (index < 0) return;
  player.party.splice(index, 1);
  if (player.active > index) player.active -= 1;
  if (player.active >= player.party.length) player.active = Math.max(0, player.party.length - 1);
}
