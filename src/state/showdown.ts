import { maxHpOf } from '../calc/damage';
import { makePokemon } from './pokemon';
import type { PokemonState, StatBlock } from './types';

const STAT_KEYS: Record<string, keyof StatBlock> = {
  hp: 'hp',
  atk: 'atk',
  def: 'def',
  spa: 'spa',
  spatk: 'spa',
  satk: 'spa',
  spd: 'spd',
  spdef: 'spd',
  sdef: 'spd',
  spe: 'spe',
};

const IGNORED = /^(?:Shiny|Happiness|Friendship|Tera Type|Ball|Language|Hidden Power|Gigantamax|Dynamax Level|Gmax)\s*:/i;

/**
 * Parses a Pokémon Showdown party or box export. Sets may be separated by blank
 * lines, or packed together the way the Null box export is, with the next
 * species line starting immediately after the previous set's last move.
 */
export function parseShowdownPaste(text: string): PokemonState[] {
  const out: PokemonState[] = [];
  let draft: Draft | null = null;
  for (const raw of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) {
      flush(draft, out);
      draft = null;
      continue;
    }
    if (/^Ability:\s*/i.test(line)) {
      if (draft) draft.ability = line.replace(/^Ability:\s*/i, '').trim();
      continue;
    }
    if (/^Level:\s*/i.test(line)) {
      const level = Number(line.replace(/^Level:\s*/i, ''));
      if (draft && Number.isFinite(level)) draft.level = level;
      continue;
    }
    if (/^IVs:\s*/i.test(line)) {
      if (draft) draft.ivs = parseSpread(line);
      continue;
    }
    if (/^EVs:\s*/i.test(line)) {
      if (draft) draft.evs = parseSpread(line);
      continue;
    }
    const nature = line.match(/^([A-Za-z]+) Nature$/i);
    if (nature) {
      if (draft) draft.nature = nature[1]!;
      continue;
    }
    const move = line.match(/^-\s+(.+)$/);
    if (move) {
      if (draft) draft.moves.push(move[1]!.trim());
      continue;
    }
    if (IGNORED.test(line)) continue;
    flush(draft, out);
    draft = { ...emptyDraft(), ...parseHeader(line) };
  }
  flush(draft, out);
  return out;
}

interface Draft {
  species: string;
  item: string;
  ability: string;
  level: number;
  nature: string;
  ivs: Partial<StatBlock>;
  evs: Partial<StatBlock>;
  moves: string[];
}

function emptyDraft(): Draft {
  return { species: '', item: '', ability: '', level: 50, nature: 'Serious', ivs: {}, evs: {}, moves: [] };
}

function parseHeader(line: string): { species: string; item: string } {
  let text = line.trim();
  let item = '';
  const at = text.match(/^(.*?)\s@\s(.+)$/);
  if (at) {
    text = at[1]!.trim();
    item = at[2]!.trim();
  }
  text = text.replace(/\s+\((?:M|F|N)\)$/, '').trim();
  const wrapped = text.match(/^(.*)\s\(([^)]+)\)$/);
  if (wrapped) return { species: wrapped[2]!.trim(), item };
  return { species: text, item };
}

function parseSpread(line: string): Partial<StatBlock> {
  const body = line.replace(/^(?:IVs|EVs):\s*/i, '');
  const spread: Partial<StatBlock> = {};
  for (const part of body.split('/')) {
    const match = part.trim().match(/^(\d+)\s+([A-Za-z]+)$/);
    if (!match) continue;
    const key = STAT_KEYS[match[2]!.toLowerCase()];
    if (key) spread[key] = Number(match[1]);
  }
  return spread;
}

function flush(draft: Draft | null, out: PokemonState[]): void {
  if (!draft?.species) return;
  const mon = makePokemon({
    species: draft.species,
    item: draft.item,
    ability: draft.ability,
    level: draft.level,
    nature: draft.nature,
    ivs: draft.ivs,
    evs: draft.evs,
    moves: draft.moves.slice(0, 4),
  });
  mon.curHp = maxHpOf(mon);
  out.push(mon);
}
