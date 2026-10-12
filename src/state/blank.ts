import { findTrainer } from '../data/trainers';
import { maxHpOf } from '../calc/damage';
import type { BattleSnapshot, PokemonState, StatusName } from './types';
import { emptySide, makePokemon, PERFECT_IVS } from './pokemon';

export function blankSnapshot(): BattleSnapshot {
  return {
    gameType: 'Singles',
    player: { active: 0, party: [], box: [], side: emptySide() },
    opponent: { trainer: '', active: 0, party: [], side: emptySide() },
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

export function partyFromTrainer(name: string): PokemonState[] {
  const trainer = findTrainer(name);
  if (!trainer) return [];
  return trainer.party.map((set) => {
    const mon = makePokemon({
      species: set.species,
      level: set.level,
      ability: set.ability,
      item: set.item,
      nature: set.nature,
      moves: set.moves,
      ivs: { ...PERFECT_IVS, ...set.ivs },
      status: (set.status ?? '') as StatusName,
    });
    mon.curHp = maxHpOf(mon);
    if (mon.status) mon.curHp = Math.max(1, mon.curHp);
    return mon;
  });
}

