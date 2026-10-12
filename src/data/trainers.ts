import raw from './trainers.json';
import type { StatBlock, StatusName } from '../state/types';

export interface TrainerSet {
  species: string;
  level: number;
  ability: string;
  item: string;
  nature: string;
  moves: string[];
  ivs?: Partial<StatBlock>;
  status?: StatusName;
}

export interface TrainerParty {
  name: string;
  party: TrainerSet[];
}

export const TRAINERS = raw as TrainerParty[];

export function findTrainer(name: string): TrainerParty | undefined {
  return TRAINERS.find((trainer) => trainer.name === name);
}
