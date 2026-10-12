import { describe, expect, it } from 'vitest';
import { afterKo } from './afterko';
import { postKoSendIn } from '../ai/switch';
import { estimateDamage, maxHpOf } from '../calc/damage';
import { battleForme } from '../calc/forme';
import { residualChip } from '../calc/residual';
import { partyFromTrainer } from '../state/blank';
import { emptySide, makePokemon } from '../state/pokemon';
import type { BattleSnapshot, PokemonState } from '../state/types';

function mon(partial: Partial<PokemonState> & Pick<PokemonState, 'species'>): PokemonState {
  const pokemon = makePokemon(partial);
  if (partial.curHp === undefined) pokemon.curHp = maxHpOf(pokemon);
  return pokemon;
}

function fight(player: PokemonState, opponent: PokemonState[], active = 0): BattleSnapshot {
  return {
    gameType: 'Singles',
    player: { active: 0, party: [player], box: [player], side: emptySide() },
    opponent: { trainer: 'Test', active, party: opponent, side: emptySide() },
    field: {
      weather: '',
      terrain: '',
      trickRoom: false,
      wonderRoom: false,
      magicRoom: false,
      gravity: false,
      mudSport: false,
      waterSport: false,
      turn: 0,
    },
  };
}

describe('residual chip', () => {
  it('chips a neutral Pokémon in sand and skips a Steel type', () => {
    const ape = mon({ species: 'Infernape', level: 51, ability: 'Blaze' });
    const steel = mon({ species: 'Steelix', level: 51, ability: 'Sturdy' });
    const sand = { sand: true, hail: false, status: false, leechSeed: false };
    expect(residualChip(ape, sand)).toEqual([{ label: 'Sandstorm', amount: Math.max(1, Math.floor(maxHpOf(ape) / 16)) }]);
    expect(residualChip(steel, sand)).toEqual([]);
  });
});

describe('after a KO', () => {
  it('scores the send-in at the HP left after the selected chip', () => {
    const player = mon({ species: 'Infernape', level: 50, ability: 'Blaze', nature: 'Naive', moves: ['Close Combat', 'Splash'] });
    const lead = mon({ species: 'Magikarp', level: 5, moves: ['Splash'], curHp: 1 });
    const fast = mon({ species: 'Infernape', level: 50, ability: 'Blaze', moves: ['Close Combat'] });
    const wall = mon({ species: 'Wobbuffet', level: 50, ability: 'Shadow Tag', moves: ['Counter'] });
    const snapshot = fight(player, [lead, fast, wall]);
    const plain = afterKo(snapshot, { playerMove: 'Close Combat', opponentMove: '', sand: false, hail: false, status: false, leechSeed: false });
    const sanded = afterKo(snapshot, { playerMove: 'Close Combat', opponentMove: '', sand: true, hail: false, status: false, leechSeed: false });
    expect(plain.kos).toBe(true);
    expect(plain.sendIns[0]?.species).toBe('Infernape');
    expect(plain.sendIns[0]!.probability).toBeGreaterThan(0.8);
    expect(sanded.playerHp).toBe(player.curHp - Math.max(1, Math.floor(maxHpOf(player) / 16)));
    expect(sanded.chips[0]).toMatch(/^Sandstorm /);
    expect(sanded.sendIns[0]?.species).toBe('Infernape');
  });

  it('does not send anyone in for a move that cannot KO', () => {
    const player = mon({ species: 'Magikarp', level: 5, moves: ['Splash'] });
    const lead = mon({ species: 'Blissey', level: 50, ability: 'Natural Cure', moves: ['Soft-Boiled'] });
    const report = afterKo(fight(player, [lead, mon({ species: 'Wobbuffet', moves: ['Counter'] })]), {
      playerMove: 'Splash',
      opponentMove: '',
      sand: false,
      hail: false,
      status: false,
      leechSeed: false,
    });
    expect(report.kos).toBe(false);
    expect(report.sendIns).toEqual([]);
  });

  it('keeps a Mega Stone holder in its base forme until it has Mega Evolved', () => {
    const player = mon({ species: 'Infernape', level: 50, ability: 'Blaze', nature: 'Serious', moves: ['Close Combat'] });
    const lead = mon({ species: 'Magikarp', level: 5, moves: ['Splash'], curHp: 1 });
    const lucario = { species: 'Lucario', level: 50, ability: 'Steadfast', nature: 'Serious', moves: ['Close Combat'] };
    const held = mon({ ...lucario, item: 'Lucarionite' });
    const base = postKoSendIn(fight(player, [lead, mon(lucario)]), player.curHp);
    const stone = postKoSendIn(fight(player, [lead, held]), player.curHp);
    expect(battleForme(mon({ species: 'Charizard', item: 'Charizardite X' })).species).toBe('Charizard-Mega-X');
    expect(battleForme(mon({ species: 'Charizard-Mega-Y', ability: 'Drought' })).ability).toBe('Drought');
    expect(stone[0]?.species).toBe('Lucario');
    expect(stone[0]!.score).toBe(base[0]!.score);
    held.megaEvolved = true;
    const evolved = postKoSendIn(fight(player, [lead, held]), player.curHp);
    expect(evolved[0]?.species).toBe('Lucario-Mega');
    expect(evolved[0]!.score).toBeGreaterThan(base[0]!.score);
    expect(evolved[0]!.reason).toContain('Enters as Lucario-Mega');
  });

  it('ignores the listed Mega until that forme is on the field', () => {
    const player = mon({ species: 'Magikarp', level: 20, moves: ['Splash'], curHp: 20 });
    const lead = mon({ species: 'Magikarp', level: 5, moves: ['Splash'], curHp: 1 });
    const base = mon({ species: 'Lucario', level: 50, ability: 'Steadfast', item: 'Lucarionite', moves: ['Close Combat'] });
    const listedMega = mon({ species: 'Lucario-Mega', level: 50, ability: 'Adaptability', item: 'Lucarionite', moves: ['Close Combat'] });
    const before = postKoSendIn(fight(player, [lead, base, listedMega]), player.curHp);
    expect(before.map((row) => row.species)).toEqual(['Lucario']);
    expect(before[0]!.reason).not.toContain('Lucario-Mega');
    const evolved = fight(player, [lead, base, listedMega], 2);
    const after = postKoSendIn(evolved, player.curHp);
    expect(after.map((row) => row.species)).not.toContain('Lucario');
    expect(after.map((row) => row.species)).not.toContain('Lucario-Mega');
    base.megaEvolved = true;
    listedMega.megaEvolved = true;
    const flagged = postKoSendIn(fight(player, [lead, base, listedMega]), player.curHp);
    expect(flagged.map((row) => row.species)).toEqual(['Lucario-Mega']);
  });

  it('sends Solrock into Greninja after Low Kick turns it Fighting', () => {
    const player = mon({
      species: 'Greninja',
      level: 38,
      ability: 'Protean',
      item: 'Oran Berry',
      nature: 'Lonely',
      ivs: { hp: 31, atk: 31, def: 17, spa: 14, spd: 31, spe: 18 },
      moves: ['Fling', 'Low Kick', 'Water Shuriken', 'Waterfall'],
    });
    const party = partyFromTrainer('Leader Roxanne');
    const snapshot = fight(player, party);
    snapshot.field.weather = 'Sand';
    const report = afterKo(snapshot, {
      playerMove: 'Low Kick',
      opponentMove: '',
      sand: true,
      hail: false,
      status: false,
      leechSeed: false,
    });
    expect(report.kos).toBe(true);
    expect(report.sendIns.map((row) => row.species)).not.toContain('Aerodactyl-Mega');
    expect(report.sendIns[0]?.species).toBe('Solrock');
    expect(report.sendIns[0]?.reason).toContain('Slower OHKO');
    expect(report.sendIns[0]?.reasons.join(' ')).toContain('Psycho Cut');
    expect(report.sendIns.map((row) => row.species)).toContain('Zygarde');
    expect(report.sendIns.find((row) => row.species === 'Zygarde')?.probability).toBe(0);
  });

  it('uses the type dropdown for the switch-in OHKO instead of Protean on the KO move', () => {
    const player = mon({
      species: 'Greninja',
      level: 38,
      ability: 'Protean',
      nature: 'Lonely',
      ivs: { hp: 31, atk: 31, def: 17, spa: 14, spd: 31, spe: 18 },
      types: ['Electric'],
      moves: ['Fling', 'Low Kick', 'Water Shuriken', 'Waterfall'],
    });
    const party = partyFromTrainer('Leader Roxanne');
    const snapshot = fight(player, party);
    snapshot.field.weather = 'Sand';
    const report = afterKo(snapshot, {
      playerMove: 'Low Kick',
      opponentMove: '',
      sand: true,
      hail: false,
      status: false,
      leechSeed: false,
    });
    const solrock = report.sendIns.find((row) => row.species === 'Solrock');
    expect(solrock?.reason).not.toContain('Slower OHKO');
    expect(solrock?.reasons.join(' ')).not.toContain('Psycho Cut mean 110');
  });

  it('drops a slower OHKO when that Pokémon is at half HP and faints first', () => {
    const player = mon({
      species: 'Greninja',
      level: 38,
      ability: 'Protean',
      item: 'Oran Berry',
      nature: 'Lonely',
      ivs: { hp: 31, atk: 31, def: 17, spa: 14, spd: 31, spe: 18 },
      moves: ['Fling', 'Low Kick', 'Water Shuriken', 'Waterfall'],
    });
    const party = partyFromTrainer('Leader Roxanne');
    const solrock = party.find((candidate) => candidate.species === 'Solrock')!;
    solrock.curHp = Math.floor(maxHpOf(solrock) / 2);
    const snapshot = fight(player, party);
    snapshot.field.weather = 'Sand';
    const report = afterKo(snapshot, {
      playerMove: 'Low Kick',
      opponentMove: '',
      sand: true,
      hail: false,
      status: false,
      leechSeed: false,
    });
    const row = report.sendIns.find((entry) => entry.species === 'Solrock');
    expect(row?.score).toBe(-1);
    expect(row?.reason).toContain('OHKO\'d');
    expect(row?.reasons.join(' ')).toContain('faints before moving');
    expect(report.sendIns[0]?.species).not.toBe('Solrock');
  });

  it('uses a switch-in\'s chosen type when deciding if you OHKO it', () => {
    const player = mon({
      species: 'Greninja',
      level: 38,
      ability: 'Torrent',
      nature: 'Lonely',
      moves: ['Waterfall'],
    });
    const rock = mon({ species: 'Solrock', level: 38, ability: 'Levitate', moves: ['Psycho Cut'], curHp: 64 });
    const water = mon({ species: 'Solrock', level: 38, ability: 'Levitate', moves: ['Psycho Cut'], types: ['Water'], curHp: 64 });
    const field = fight(player, [rock]).field;
    const side = fight(player, [rock]).player.side;
    const intoRock = estimateDamage(player, rock, 'Waterfall', field, side, side);
    const intoWater = estimateDamage(player, water, 'Waterfall', field, side, side);
    expect(intoRock.max).toBeGreaterThanOrEqual(64);
    expect(intoWater.max).toBeLessThan(64);
  });

  it('keeps a stored type for later KOs', () => {
    const fighting = mon({ species: 'Greninja', level: 38, ability: 'Torrent', nature: 'Lonely', types: ['Fighting'] });
    const speciesTyped = mon({ species: 'Greninja', level: 38, ability: 'Torrent', nature: 'Lonely' });
    const solrock = mon({ species: 'Solrock', level: 38, ability: 'Levitate', moves: ['Psycho Cut'] });
    const snapshot = fight(fighting, [solrock]);
    const intoFighting = estimateDamage(solrock, fighting, 'Psycho Cut', snapshot.field, snapshot.opponent.side, snapshot.player.side);
    const intoSpecies = estimateDamage(solrock, speciesTyped, 'Psycho Cut', snapshot.field, snapshot.opponent.side, snapshot.player.side);
    expect(intoSpecies.max).toBe(0);
    expect(intoFighting.mean).toBeGreaterThan(0);
  });

  it('skips a Pokémon marked KO\'d', () => {
    const player = mon({ species: 'Magikarp', level: 30, moves: ['Splash'], curHp: 20 });
    const lead = mon({ species: 'Magikarp', level: 5, moves: ['Splash'], curHp: 1 });
    const ape = mon({ species: 'Infernape', level: 50, ability: 'Blaze', moves: ['Close Combat'] });
    const wobbuffet = mon({ species: 'Wobbuffet', level: 50, ability: 'Shadow Tag', moves: ['Counter'] });
    ape.fainted = true;
    ape.curHp = 0;
    const sendIns = postKoSendIn(fight(player, [lead, ape, wobbuffet]), player.curHp);
    expect(sendIns.map((row) => row.species)).toEqual(['Wobbuffet']);
  });

  it('picks the faster OHKO from the bench', () => {
    const player = mon({ species: 'Magikarp', level: 30, moves: ['Splash'], curHp: 20 });
    const lead = mon({ species: 'Magikarp', level: 5, moves: ['Splash'], curHp: 1 });
    const sendIns = postKoSendIn(fight(player, [lead, mon({ species: 'Infernape', level: 50, ability: 'Blaze', moves: ['Close Combat'] }), mon({ species: 'Wobbuffet', level: 50, ability: 'Shadow Tag', moves: ['Counter'] })]), player.curHp);
    expect(sendIns[0]).toMatchObject({ species: 'Infernape', probability: 1 });
    expect(sendIns[0]!.reason).toContain('Faster OHKO');
  });
});
