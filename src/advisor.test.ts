import { describe, expect, it } from 'vitest';
import { rankReplies } from './advice/respond';
import { shouldRecoverChance } from './ai/effects';
import type { ScoreFacts } from './ai/facts';
import { predictOpponent } from './ai/predict';
import { isSupport, sendInBaseScore } from './ai/switch';
import { maxHpOf } from './calc/damage';
import { makePokemon, emptySide } from './state/pokemon';
import type { BattleSnapshot, PokemonState } from './state/types';

function mon(partial: Partial<PokemonState> & Pick<PokemonState, 'species'>): PokemonState {
  const pokemon = makePokemon(partial);
  if (!partial.curHp) pokemon.curHp = maxHpOf(pokemon);
  return pokemon;
}

function battle(ai: PokemonState, player: PokemonState, patch?: Partial<BattleSnapshot>): BattleSnapshot {
  return {
    gameType: 'Singles',
    player: { active: 0, party: [player], box: [player], side: emptySide() },
    opponent: { trainer: 'Test', active: 0, party: [ai], side: emptySide() },
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
    ...patch,
  };
}

describe('Null AI scoring', () => {
  it('treats a faster OHKO as a +5 send-in', () => {
    expect(sendInBaseScore({
      aiFirst: true,
      ohko: true,
      hits: 1,
      playerOhkos: false,
      species: 'Abomasnow',
      ability: 'Soundproof',
      immediateDamage: false,
      immediateOhko: false,
      slowerAndTwoHko: false,
    })).toBe(5);
  });

  it('classes a one-attack utility set as Support and a sweeper as not', () => {
    expect(isSupport(mon({
      species: 'Dewgong',
      moves: ['Encore', 'Toxic', 'Flip Turn', 'Protect'],
    }))).toBe(true);
    expect(isSupport(mon({
      species: 'Abomasnow',
      moves: ['Blizzard', 'Wood Hammer', 'Earthquake', 'Aurora Veil'],
    }))).toBe(false);
  });

  it('picks the fast kill over a setup move', () => {
    const ai = mon({
      species: 'Alakazam',
      level: 100,
      ability: 'Magic Guard',
      nature: 'Timid',
      moves: ['Psychic', 'Swords Dance'],
    });
    const player = mon({ species: 'Magikarp', level: 1, moves: ['Splash'], curHp: 1 });
    const prediction = predictOpponent(battle(ai, player));
    const psychic = prediction.actions.find((action) => action.move === 'Psychic');
    const dance = prediction.actions.find((action) => action.move === 'Swords Dance');
    expect(psychic?.probability ?? 0).toBeGreaterThan(0.9);
    expect(psychic?.damage).toMatch(/\d/);
    expect(dance?.damage).toBe('');
    expect(dance?.probability ?? 1).toBeLessThan(0.1);
  });

  it('discards Stealth Rock once it is already up', () => {
    const ai = mon({
      species: 'Forretress',
      level: 50,
      ability: 'Sturdy',
      nature: 'Relaxed',
      moves: ['Stealth Rock', 'Tackle'],
    });
    const player = mon({ species: 'Magikarp', level: 50, moves: ['Splash'] });
    const snapshot = battle(ai, player);
    snapshot.player.side.stealthRock = true;
    const prediction = predictOpponent(snapshot);
    const tackle = prediction.actions.find((action) => action.move === 'Tackle');
    const rocks = prediction.actions.find((action) => action.move === 'Stealth Rock');
    expect(tackle?.probability ?? 0).toBeGreaterThan(0.9);
    expect(rocks?.modalScore).toBe(-20);
  });

  it('switches into Storm Drain when the last move was Water, ahead of a higher send-in score', () => {
    const solrock = mon({ species: 'Solrock', level: 38, ability: 'Levitate', moves: ['Psycho Cut', 'Bulldoze'] });
    const zygarde = mon({ species: 'Zygarde', level: 37, ability: 'Power Construct', moves: ['Land\'s Wrath', 'Skitter Smack'] });
    const cradily = mon({ species: 'Cradily', level: 37, ability: 'Storm Drain', moves: ['Recover', 'Stockpile', 'Sand Tomb', 'Ancient Power'] });
    const player = mon({
      species: 'Greninja',
      level: 38,
      ability: 'Protean',
      moves: ['Waterfall', 'Low Kick'],
      lastMove: 'Waterfall',
    });
    const snapshot = battle(solrock, player, {
      opponent: { trainer: 'Leader Roxanne', active: 0, party: [solrock, zygarde, cradily], side: emptySide() },
    });
    const prediction = predictOpponent(snapshot);
    const intoCradily = prediction.actions.find((action) => action.label === 'Switch to Cradily');
    expect(prediction.switchReason).toContain('Storm Drain');
    expect(intoCradily?.probability).toBeCloseTo(0.75);
    expect(prediction.actions.some((action) => action.label === 'Switch to Zygarde')).toBe(false);
  });

  it('does not absorb into Water Absorb at full HP', () => {
    const lead = mon({ species: 'Solrock', level: 50, ability: 'Levitate', moves: ['Psycho Cut'] });
    const absorber = mon({ species: 'Vaporeon', level: 50, ability: 'Water Absorb', moves: ['Surf'] });
    const player = mon({ species: 'Greninja', level: 50, ability: 'Protean', moves: ['Waterfall'], lastMove: 'Waterfall' });
    const full = predictOpponent(battle(lead, player, {
      opponent: { trainer: 'Test', active: 0, party: [lead, absorber], side: emptySide() },
    }));
    expect(full.switchReason).not.toContain('Water Absorb');
    absorber.curHp = Math.floor(maxHpOf(absorber) * 0.5);
    const hurt = predictOpponent(battle(lead, player, {
      opponent: { trainer: 'Test', active: 0, party: [lead, absorber], side: emptySide() },
    }));
    expect(hurt.actions.find((action) => action.label === 'Switch to Vaporeon')?.probability).toBeCloseTo(0.75);
  });

  it('recovers for sure when slower and under half, and refuses Rest alternatives while toxic', () => {
    const low = recoverFacts({ curHp: 30, maxHp: 100, aiFirst: false, status: '' });
    expect(shouldRecoverChance(low)).toBe(1);
    const toxic = recoverFacts({ curHp: 30, maxHp: 100, aiFirst: false, status: 'tox', move: 'Recover' });
    expect(shouldRecoverChance(toxic)).toBe(0);
    const rest = recoverFacts({ curHp: 30, maxHp: 100, aiFirst: false, status: 'tox', move: 'Rest' });
    expect(shouldRecoverChance(rest)).toBe(1);
  });
});

describe('player replies', () => {
  it('uses the player priority the AI does not plan around', () => {
    const ai = mon({
      species: 'Jolteon',
      level: 100,
      ability: 'Volt Absorb',
      nature: 'Timid',
      moves: ['Thunderbolt'],
      curHp: 1,
    });
    const player = mon({
      species: 'Conkeldurr',
      level: 100,
      ability: 'Guts',
      nature: 'Brave',
      ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 0 },
      moves: ['Mach Punch', 'Hammer Arm'],
      curHp: 1,
    });
    const prediction = predictOpponent(battle(ai, player));
    const replies = rankReplies(battle(ai, player), prediction.actions);
    const punch = replies.find((reply) => reply.label === 'Mach Punch');
    const hammer = replies.find((reply) => reply.label === 'Hammer Arm');
    expect(punch?.faintRisk ?? 1).toBeLessThan(0.05);
    expect(hammer?.faintRisk ?? 0).toBeGreaterThan(0.9);
    expect(replies[0]?.label).toBe('Mach Punch');
  });
});

function recoverFacts(options: { curHp: number; maxHp: number; aiFirst: boolean; status: '' | 'tox'; move?: string }): ScoreFacts {
  const ai = mon({ species: 'Blissey', level: 100, moves: ['Soft-Boiled'], curHp: options.curHp, status: options.status });
  const player = mon({ species: 'Magikarp', level: 1, moves: ['Splash'] });
  return {
    ai,
    player,
    field: {
      weather: '', terrain: '', trickRoom: false, wonderRoom: false, magicRoom: false, gravity: false, mudSport: false, waterSport: false, turn: 0,
    },
    aiSide: emptySide(),
    playerSide: emptySide(),
    move: options.move ?? 'Soft-Boiled',
    category: 'Status',
    type: 'Normal',
    bp: 0,
    priority: 0,
    hits: 1,
    damage: 0,
    isHdm: false,
    kills: false,
    aiFirst: options.aiFirst,
    playerCanFaint: false,
    playerHits: 99,
    playerFastTwoHit: false,
    aiMaxKills: false,
    moveHits: 99,
    aiLastMon: true,
    playerLastMon: true,
    incapacitated: false,
    playerPhysical: false,
    playerSpecial: false,
    aiTypes: ['Normal'],
    playerTypes: ['Water'],
    aiMaxHp: options.maxHp,
    playerMaxHp: 1,
    paraFlipsSpeed: false,
    allyLowHp: false,
    partyStatus: false,
    estimate: { rolls: [0], weights: [{ damage: 0, p: 1 }], min: 0, max: 0, mean: 0, priority: 0, category: 'Status', type: 'Normal', bp: 0, hits: 1 },
  };
}
