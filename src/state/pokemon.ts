import type { Boosts, PokemonState, SideState, StatBlock, StatusName } from './types';

export const ZERO_EVS: StatBlock = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
export const PERFECT_IVS: StatBlock = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };

export function zeroBoosts(): Boosts {
  return { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 };
}

export function emptySide(): SideState {
  return {
    stealthRock: false,
    spikes: 0,
    toxicSpikes: 0,
    stickyWeb: false,
    lightScreen: false,
    reflect: false,
    auroraVeil: false,
    tailwind: false,
  };
}

export function makePokemon(partial: Omit<Partial<PokemonState>, 'ivs' | 'evs' | 'boosts'> & Pick<PokemonState, 'species'> & {
  ivs?: Partial<StatBlock>;
  evs?: Partial<StatBlock>;
  boosts?: Partial<Boosts>;
}): PokemonState {
  return {
    level: 50,
    ability: '',
    item: '',
    nature: 'Serious',
    curHp: 1,
    status: '' as StatusName,
    fainted: false,
    megaEvolved: false,
    turnsActive: 0,
    lastMove: '',
    protectStreak: 0,
    usedProtectLastTurn: false,
    leechSeeded: false,
    substitute: false,
    disguiseIntact: false,
    lockedMove: '',
    perishCount: null,
    taunted: false,
    encored: false,
    confused: false,
    infatuated: false,
    cursed: false,
    trapped: false,
    wrapped: false,
    yawned: false,
    defenseCurl: false,
    stockpile: 0,
    focusEnergy: false,
    laserFocus: false,
    lockOn: false,
    charging: false,
    commander: '',
    unburdenActive: false,
    slowStart: false,
    ...partial,
    ivs: { ...PERFECT_IVS, ...partial.ivs },
    evs: { ...ZERO_EVS, ...partial.evs },
    boosts: { ...zeroBoosts(), ...partial.boosts },
    moves: (partial.moves ?? []).filter(Boolean).slice(0, 4),
  };
}
