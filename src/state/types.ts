export type StatName = 'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe';

export interface StatBlock {
  hp: number;
  atk: number;
  def: number;
  spa: number;
  spd: number;
  spe: number;
}

export interface Boosts {
  atk: number;
  def: number;
  spa: number;
  spd: number;
  spe: number;
  accuracy: number;
  evasion: number;
}

/** Empty string is healthy. `frb` is Null frostbite, which the damage calc treats as a special-attack cut. */
export type StatusName = '' | 'brn' | 'par' | 'psn' | 'tox' | 'slp' | 'frz' | 'frb';

export interface PokemonState {
  species: string;
  level: number;
  ability: string;
  item: string;
  nature: string;
  moves: string[];
  ivs: StatBlock;
  evs: StatBlock;
  curHp: number;
  status: StatusName;
  boosts: Boosts;
  fainted: boolean;
  /** This Pokémon has already Mega Evolved. A listed Mega is the same Pokémon until this is set. */
  megaEvolved: boolean;
  /** Turns this Pokémon has been on the field. */
  turnsActive: number;
  lastMove: string;
  protectStreak: number;
  usedProtectLastTurn: boolean;
  leechSeeded: boolean;
  substitute: boolean;
  disguiseIntact: boolean;
  lockedMove: string;
  /** Turns of Perish Song left. Null when the effect is absent. */
  perishCount: number | null;
  /** Current types after Protean or Libero. Empty uses the species types. */
  types?: string[];
  taunted: boolean;
  encored: boolean;
  confused: boolean;
  infatuated: boolean;
  cursed: boolean;
  trapped: boolean;
  wrapped: boolean;
  yawned: boolean;
  defenseCurl: boolean;
  stockpile: number;
  focusEnergy: boolean;
  laserFocus: boolean;
  lockOn: boolean;
  charging: boolean;
  /** Tatsugiri form while Commander is active. */
  commander: '' | 'curly' | 'droopy' | 'stretchy';
  unburdenActive: boolean;
  slowStart: boolean;
}

export interface SideState {
  stealthRock: boolean;
  spikes: number;
  toxicSpikes: number;
  stickyWeb: boolean;
  lightScreen: boolean;
  reflect: boolean;
  auroraVeil: boolean;
  tailwind: boolean;
}

export type WeatherName =
  | ''
  | 'Sun'
  | 'Rain'
  | 'Sand'
  | 'Snow'
  | 'Hail'
  | 'Harsh Sunshine'
  | 'Heavy Rain'
  | 'Strong Winds';

export type TerrainName = '' | 'Electric' | 'Grassy' | 'Psychic' | 'Misty';

export interface FieldState {
  weather: WeatherName;
  terrain: TerrainName;
  trickRoom: boolean;
  wonderRoom: boolean;
  magicRoom: boolean;
  gravity: boolean;
  mudSport: boolean;
  waterSport: boolean;
  turn: number;
}

export interface PartySide {
  active: number;
  party: PokemonState[];
  side: SideState;
}

export interface PlayerSide extends PartySide {
  /** Every Pokémon you own. Party members are references into this list. */
  box: PokemonState[];
}

export interface BattleSnapshot {
  gameType: 'Singles' | 'Doubles';
  player: PlayerSide;
  opponent: PartySide & { trainer: string };
  field: FieldState;
}

export interface BattleStateSource {
  readonly kind: 'manual' | 'emulator';
  read(): BattleSnapshot;
}
