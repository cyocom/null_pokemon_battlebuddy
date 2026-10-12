import { describe, expect, it } from 'vitest';
import { makePokemon, emptySide } from './pokemon';
import { addBoxMonToParty, removeFromParty } from './roster';
import type { PlayerSide } from './types';

function side(box: ReturnType<typeof makePokemon>[]): PlayerSide {
  return { active: 0, party: [], box, side: emptySide() };
}

describe('box and party', () => {
  it('adds a boxed Pokémon by reference and refuses duplicates and a full party', () => {
    const bells = makePokemon({ species: 'Bellossom' });
    const falinks = makePokemon({ species: 'Falinks' });
    const player = side([bells, falinks]);
    expect(addBoxMonToParty(player, bells)).toBeNull();
    expect(player.party).toEqual([bells]);
    expect(addBoxMonToParty(player, bells)).toBe('Already in your party.');
    expect(addBoxMonToParty(player, makePokemon({ species: 'Magikarp' }))).toBe('That Pokémon is not in your box.');
    for (let i = player.party.length; i < 6; i++) {
      const extra = makePokemon({ species: `Extra${i}` });
      player.box.push(extra);
      expect(addBoxMonToParty(player, extra)).toBeNull();
    }
    const seventh = makePokemon({ species: 'Swanna' });
    player.box.push(seventh);
    expect(addBoxMonToParty(player, seventh)).toBe('Your party already has 6 Pokémon.');
    expect(player.party).toHaveLength(6);
  });

  it('removes a party member without deleting it from the box', () => {
    const bells = makePokemon({ species: 'Bellossom' });
    const falinks = makePokemon({ species: 'Falinks' });
    const player = side([bells, falinks]);
    player.party.push(bells, falinks);
    player.active = 1;
    removeFromParty(player, bells);
    expect(player.party).toEqual([falinks]);
    expect(player.box).toEqual([bells, falinks]);
    expect(player.active).toBe(0);
  });
});
