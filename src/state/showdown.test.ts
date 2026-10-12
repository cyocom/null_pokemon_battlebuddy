import { describe, expect, it } from 'vitest';
import { parseShowdownPaste } from './showdown';

const PACKED = `Bellossom @ Big Root 
Ability: Illuminate 
Level: 38 
Quirky Nature 
IVs: 31 HP / 15 Atk / 26 Def / 3 SpA / 17 SpD / 31 Spe 
- Giga Drain 
- Charm 
- Sleep Powder 
- Moonlight 
Falinks 
Ability: Battle Armor 
Level: 38 
Calm Nature 
IVs: 28 HP / 14 Atk / 23 Def / 26 SpA / 28 SpD / 21 Spe 
- First Impression 
- Body Press 
- Brick Break 
- Low Sweep 
Linoone-Galar @ Oran Berry 
Ability: Gluttony 
Level: 38 
Naive Nature 
IVs: 28 HP / 29 Atk / 26 Def / 7 SpA / 24 SpD / 2 Spe 
- Take Down 
- Snarl 
- Counter 
- Night Slash `;

describe('showdown paste', () => {
  it('reads packed sets, missing items, and regional forms', () => {
    const box = parseShowdownPaste(PACKED);
    expect(box.map((mon) => mon.species)).toEqual(['Bellossom', 'Falinks', 'Linoone-Galar']);
    expect(box[0]).toMatchObject({
      item: 'Big Root',
      ability: 'Illuminate',
      level: 38,
      nature: 'Quirky',
      ivs: { hp: 31, atk: 15, def: 26, spa: 3, spd: 17, spe: 31 },
      moves: ['Giga Drain', 'Charm', 'Sleep Powder', 'Moonlight'],
    });
    expect(box[0]!.curHp).toBeGreaterThan(1);
    expect(box[1]!.item).toBe('');
    expect(box[1]!.moves).toEqual(['First Impression', 'Body Press', 'Brick Break', 'Low Sweep']);
    expect(box[2]!.item).toBe('Oran Berry');
    expect(box[2]!.ability).toBe('Gluttony');
  });

  it('reads blank-line sets, nicknames, gender, and EVs', () => {
    const box = parseShowdownPaste(`Ace (Greninja) (M) @ Oran Berry
Ability: Protean
Level: 38
EVs: 4 HP / 252 Atk / 252 Spe
Lonely Nature
- Waterfall

Swanna @ Oran Berry
Ability: No Guard
Tera Type: Water
Shiny: Yes
- Scald
`);
    expect(box).toHaveLength(2);
    expect(box[0]).toMatchObject({
      species: 'Greninja',
      item: 'Oran Berry',
      nature: 'Lonely',
      evs: { hp: 4, atk: 252, spe: 252 },
      moves: ['Waterfall'],
    });
    expect(box[1]!.species).toBe('Swanna');
    expect(box[1]!.moves).toEqual(['Scald']);
  });

  it('returns nothing for an empty clipboard', () => {
    expect(parseShowdownPaste('   \n')).toEqual([]);
  });
});
