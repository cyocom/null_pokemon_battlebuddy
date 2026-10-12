import { estimateDamage, hitsToKo, maxHpOf, moveMeta, speedOf, typesOf } from '../calc/damage';
import { actingForme, unavailableForme } from '../calc/forme';
import { hazardDamage } from '../calc/hazards';
import { aiMovesFirst } from '../calc/speed';
import { OHKO_MOVES, PHAZING_MOVES, PIVOT_MOVES, SUPPORT_UTILITY } from '../data/null-moves';
import type { BattleSnapshot, PokemonState } from '../state/types';

export interface SendInInput {
  aiFirst: boolean;
  /** This Pokémon KOs the player in one hit. */
  ohko: boolean;
  hits: number;
  playerOhkos: boolean;
  species: string;
  ability: string;
  /** Takes a fast pivot hit on the way in. */
  immediateDamage: boolean;
  immediateOhko: boolean;
  slowerAndTwoHko: boolean;
}

/**
 * Post-KO send-in score, before the 10% Support bonus.
 * The doc's +3 and +2 lines lost their hit counts in export; they sit under the OHKO lines, so they are 2HKOs.
 */
export function sendInBaseScore(input: SendInInput): number {
  let score = 0;
  if (input.aiFirst && input.ohko) score = 5;
  else if (!input.aiFirst && input.ohko) score = 4;
  else if ((input.aiFirst && input.hits <= 2) || (input.species === 'Ditto' && input.ability === 'Imposter')) score = 3;
  else if ((!input.aiFirst && input.hits <= 2 && input.hits < 99) || input.species === 'Wynaut' || input.species === 'Wobbuffet') score = 2;
  else if (input.aiFirst) score = 1;
  else if (!input.aiFirst && input.playerOhkos && !(input.species === 'Ditto' && input.ability === 'Imposter')) score = -1;
  if (input.immediateDamage) {
    if (input.immediateOhko) score -= 2;
    else if (input.slowerAndTwoHko) score -= 1;
  }
  return score;
}

export function isSupport(mon: PokemonState): boolean {
  if (mon.ability === 'Imposter') return false;
  let damaging = 0;
  for (const move of mon.moves) {
    if (!move) continue;
    if (SUPPORT_UTILITY.has(move)) continue;
    if (mon.species.startsWith('Cramorant') && (move === 'Surf' || move === 'Dive')) continue;
    const meta = moveMeta(move, mon);
    if (meta.category === 'Status' || meta.bp <= 0) continue;
    if (meta.bp > 75) return false;
    damaging += 1;
  }
  return damaging <= 1;
}

export interface SwitchChoice {
  probability: number;
  reason: string;
  /** Anti-setup breaks party-order ties at random. */
  randomTie: boolean;
  allowNegative: boolean;
  unspecified: string[];
  targets: { index: number; probability: number; score: number }[];
}

export function chooseSwitch(
  snapshot: BattleSnapshot,
  allMovesWorthless: boolean,
  bestDamageRatio: number,
): SwitchChoice {
  const ai = actingForme(snapshot.opponent.party[snapshot.opponent.active]!);
  const player = snapshot.player.party[snapshot.player.active]!;
  const unspecified: string[] = [];
  const avoid = avoidSwitch(snapshot);
  let probability = 0;
  let reason = 'No switch condition matched';
  let randomTie = false;
  let allowNegative = false;

  if (ai.perishCount !== null && ai.perishCount <= 1) {
    probability = 1;
    reason = 'Perish Song is about to faint this Pokémon';
  } else if (ai.species.startsWith('Palafin') && !aiIsFaster(snapshot) && playerCanKoActive(snapshot)) {
    probability = 1;
    reason = 'Palafin is slower and gets KO\'d';
  } else if (ai.turnsActive > 1 && allMovesWorthless) {
    probability = 0.4;
    reason = 'Anti-setup: every move is useless';
    randomTie = true;
  } else if (ai.turnsActive > 25) {
    probability = 0.4;
    reason = 'Anti-setup plus: active for more than 25 turns';
    randomTie = true;
    allowNegative = true;
  } else if (walled(snapshot, bestDamageRatio) && ai.turnsActive > 5 && !avoid && snapshot.gameType === 'Singles') {
    probability = 0.2;
    reason = 'Walled for more than five turns';
  } else if (isSupport(ai) && ai.turnsActive > 1 && !avoid) {
    probability = 0.2;
    reason = 'Support Pokémon looks for a switch';
  } else if (weatherLapsed(ai, snapshot) && ai.turnsActive > 1 && !avoid) {
    probability = 0.2;
    reason = 'Weather or terrain ability has faded';
  } else if (ai.turnsActive > 12 && !avoid) {
    probability = 0.2;
    reason = 'Anti-stall after 12 turns';
  } else if (ai.ability === 'Regenerator' && !avoid) {
    unspecified.push('Regenerator switch has a blank condition in the AI doc, so it is not applied.');
  }

  const immunity = probability === 0 ? immunitySwitch(snapshot) : undefined;
  const targets = immunity
    ? [{ index: immunity.index, probability: 1, score: immunity.score }]
    : benchTargets(snapshot, allowNegative, randomTie);
  if (immunity) {
    probability = 0.75;
    reason = immunity.reason;
  }
  if (!targets.length) probability = 0;
  if (!allowNegative && targets.every((target) => target.score < 0)) probability = 0;
  return { probability, reason, randomTie, allowNegative, unspecified, targets };
}

function benchTargets(snapshot: BattleSnapshot, allowNegative: boolean, randomTie: boolean): SwitchChoice['targets'] {
  const player = snapshot.player.party[snapshot.player.active]!;
  const candidates = snapshot.opponent.party
    .map((mon, index) => ({ mon, index }))
    .filter(({ mon, index }) => index !== snapshot.opponent.active && !mon.fainted && mon.curHp > 0 && !unavailableForme(snapshot.opponent.party, index, snapshot.opponent.active));
  if (!candidates.length) return [];
  const supports = candidates.map(({ mon }) => isSupport(mon));
  const rolls = 1 << supports.filter(Boolean).length;
  const totals = new Map<number, number>();
  let supportCursor = 0;
  const supportIndexes = candidates.map((candidate, i) => (supports[i] ? supportCursor++ : -1));
  for (let mask = 0; mask < Math.max(1, rolls); mask++) {
    const scored = candidates.map((candidate, i) => {
      const base = scoreCandidate(snapshot, candidate.mon, player).score;
      const supportBit = supportIndexes[i]!;
      const bonus = supportBit >= 0 && base !== -1 && (mask & (1 << supportBit)) ? 2 : 0;
      return { index: candidate.index, score: base + bonus };
    });
    const pool = allowNegative ? scored : scored.filter((row) => row.score >= 0);
    if (!pool.length) continue;
    const best = Math.max(...pool.map((row) => row.score));
    const winners = pool.filter((row) => row.score === best);
    const p = 1 / Math.max(1, rolls);
    if (randomTie) {
      for (const winner of winners) totals.set(winner.index, (totals.get(winner.index) ?? 0) + p / winners.length);
    } else {
      const first = winners.reduce((earliest, row) => (row.index < earliest.index ? row : earliest));
      totals.set(first.index, (totals.get(first.index) ?? 0) + p);
    }
  }
  const mass = [...totals.values()].reduce((sum, value) => sum + value, 0) || 1;
  return [...totals.entries()].map(([index, probability]) => ({
    index,
    probability: probability / mass,
    score: scoreCandidate(snapshot, snapshot.opponent.party[index]!, player).score,
  }));
}

export interface PostKoSendIn {
  index: number;
  species: string;
  probability: number;
  score: number;
  reason: string;
  /** Scoring lines, in the same shape as a move's clause list. */
  reasons: string[];
}

/** Who they send in after the active Pokémon faints, scored at the player's HP after the KO line. */
export function postKoSendIn(snapshot: BattleSnapshot, playerHp: number): PostKoSendIn[] {
  const active = snapshot.player.active;
  const player = snapshot.player.party[active];
  if (!player) return [];
  const viewed: BattleSnapshot = {
    ...snapshot,
    player: {
      ...snapshot.player,
      party: snapshot.player.party.map((mon, index) => (index === active ? { ...mon, curHp: Math.max(1, playerHp) } : mon)),
    },
  };
  const candidates = viewed.opponent.party
    .map((mon, index) => ({ mon, index }))
    .filter(({ mon, index }) => index !== viewed.opponent.active && !mon.fainted && mon.curHp > 0 && !unavailableForme(viewed.opponent.party, index, viewed.opponent.active));
  if (!candidates.length) return [];
  const supports = candidates.map(({ mon }) => isSupport(mon));
  const supportCount = supports.filter(Boolean).length;
  const totals = new Map<number, number>();
  let supportCursor = 0;
  const supportIndexes = supports.map((support) => (support ? supportCursor++ : -1));
  const rolls = 1 << supportCount;
  for (let mask = 0; mask < Math.max(1, rolls); mask++) {
    const weight = subsetWeight(mask, supportCount, 0.1);
    const scored = candidates.map((candidate, i) => {
      const base = scoreCandidate(viewed, candidate.mon, viewed.player.party[active]!).score;
      const supportBit = supportIndexes[i]!;
      const bonus = supportBit >= 0 && base !== -1 && (mask & (1 << supportBit)) ? 2 : 0;
      return { index: candidate.index, score: base + bonus };
    });
    const best = Math.max(...scored.map((row) => row.score));
    const winners = scored.filter((row) => row.score === best);
    const first = winners.reduce((earliest, row) => (row.index < earliest.index ? row : earliest));
    totals.set(first.index, (totals.get(first.index) ?? 0) + weight);
  }
  const mass = [...totals.values()].reduce((sum, value) => sum + value, 0) || 1;
  return candidates
    .map(({ mon, index }) => {
      const detail = scoreCandidate(viewed, mon, viewed.player.party[active]!);
      const forme = detail.forme === mon.species ? '' : `Enters as ${detail.forme}`;
      const support = isSupport(mon) && detail.score !== -1 ? 'Support +2 on 10% of rolls' : '';
      const reasons = [...detail.reasons, forme, support].filter(Boolean);
      return {
        index,
        species: detail.forme,
        probability: (totals.get(index) ?? 0) / mass,
        score: detail.score,
        reason: [detail.reason, forme, support].filter(Boolean).join(' · '),
        reasons,
      };
    })
    .sort((a, b) => b.probability - a.probability || b.score - a.score || a.index - b.index);
}

function subsetWeight(mask: number, supportCount: number, chance: number): number {
  let weight = 1;
  for (let bit = 0; bit < supportCount; bit++) weight *= mask & (1 << bit) ? chance : 1 - chance;
  return weight;
}

interface MoveLine {
  move: string;
  mean: number;
  max: number;
  hits: number;
  ohko: boolean;
}

function scoreCandidate(snapshot: BattleSnapshot, mon: PokemonState, player: PokemonState): { score: number; reason: string; reasons: string[]; forme: string } {
  const entering = actingForme(mon);
  const chip = hazardDamage(entering, snapshot.opponent.side);
  const hp = Math.max(1, entering.curHp - chip);
  const scoredMon = { ...entering, curHp: hp };
  let bestHits = 99;
  let ohko = false;
  let attack: MoveLine | undefined;
  for (const move of mon.moves) {
    const estimate = estimateDamage(scoredMon, player, move, snapshot.field, snapshot.opponent.side, snapshot.player.side);
    if (estimate.category === 'Status' || estimate.max <= 0) continue;
    const hits = hitsToKo(estimate, player.curHp, player.disguiseIntact || player.substitute ? 1 : 0);
    const moveOhko = estimate.max >= player.curHp && !player.substitute && !(player.disguiseIntact && estimate.hits <= 1);
    bestHits = Math.min(bestHits, hits);
    if (moveOhko) ohko = true;
    attack = preferLine(attack, { move, mean: estimate.mean, max: estimate.max, hits, ohko: moveOhko });
  }
  const aiSpeed = speedOf(scoredMon, snapshot.field, snapshot.opponent.side);
  const playerSpeed = speedOf(player, snapshot.field, snapshot.player.side);
  const aiFirst = aiMovesFirst(aiSpeed, playerSpeed, snapshot.field.trickRoom);
  const incoming = playerAttackInto(snapshot, scoredMon);
  const faintsFirst = !aiFirst && incoming.ohko;
  const input: SendInInput = {
    aiFirst,
    ohko: ohko && !faintsFirst,
    hits: faintsFirst ? 99 : bestHits,
    playerOhkos: incoming.ohko,
    species: mon.species,
    ability: mon.ability,
    immediateDamage: incoming.immediate,
    immediateOhko: incoming.ohko && incoming.immediate,
    slowerAndTwoHko: !aiFirst && incoming.hits <= 2,
  };
  const evidence = {
    attack,
    incoming: incoming.line,
    aiSpeed,
    playerSpeed,
    playerHp: player.curHp,
    enterHp: hp,
    maxHp: maxHpOf(scoredMon),
    hazard: chip,
    faintsFirst,
  };
  return { score: sendInBaseScore(input), reason: describeSendIn(input), reasons: sendInReasons(input, evidence), forme: scoredMon.species };
}

/** Damage, speed, and HP lines behind a send-in score. */
export function explainSwitchIn(snapshot: BattleSnapshot, mon: PokemonState, player: PokemonState): { score: number; reasons: string[] } {
  const detail = scoreCandidate(snapshot, mon, player);
  return { score: detail.score, reasons: detail.reasons };
}

function preferLine(current: MoveLine | undefined, next: MoveLine): MoveLine {
  if (!current) return next;
  if (next.ohko !== current.ohko) return next.ohko ? next : current;
  if (next.hits !== current.hits) return next.hits < current.hits ? next : current;
  return next.mean > current.mean ? next : current;
}

function sendInReasons(input: SendInInput, evidence: { attack?: MoveLine; incoming?: MoveLine; aiSpeed: number; playerSpeed: number; playerHp: number; enterHp: number; maxHp: number; hazard: number; faintsFirst: boolean }): string[] {
  const score = sendInBaseScore(input);
  const sign = score > 0 ? `+${score}` : `${score}`;
  const lines = [`${describeSendIn(input)} (${sign})`];
  if (!evidence.attack) lines.push('No damaging move');
  else lines.push(evidence.faintsFirst ? `${damageLine(evidence.attack, evidence.playerHp)}, but it faints before moving` : damageLine(evidence.attack, evidence.playerHp));
  const order = input.aiFirst ? (evidence.aiSpeed === evidence.playerSpeed ? 'Speed tie, counted as faster' : 'Faster') : 'Slower';
  lines.push(`${order} (${evidence.aiSpeed} vs ${evidence.playerSpeed})`);
  if (evidence.incoming) lines.push(`You: ${damageLine(evidence.incoming, evidence.enterHp)}`);
  if (evidence.enterHp < evidence.maxHp) {
    const hazard = evidence.hazard > 0 ? ` after hazards ${evidence.hazard}` : '';
    lines.push(`Enters at ${evidence.enterHp}/${evidence.maxHp}${hazard}`);
  }
  return lines;
}

function damageLine(line: MoveLine, hp: number): string {
  const result = line.ohko ? 'OHKO' : line.hits < 99 ? `${line.hits}HKO` : 'no KO';
  return `${line.move} mean ${Math.round(line.mean)} / max ${line.max} vs ${hp} HP (${result})`;
}

function describeSendIn(input: SendInInput): string {
  const parts: string[] = [];
  if (input.aiFirst && input.ohko) parts.push('Faster OHKO');
  else if (!input.aiFirst && input.ohko) parts.push('Slower OHKO');
  else if (input.species === 'Ditto' && input.ability === 'Imposter') parts.push('Imposter');
  else if (input.aiFirst && input.hits <= 2) parts.push('Faster 2HKO');
  else if (input.species === 'Wynaut' || input.species === 'Wobbuffet') parts.push(input.species);
  else if (!input.aiFirst && input.hits <= 2 && input.hits < 99) parts.push('Slower 2HKO');
  else if (input.aiFirst) parts.push('Faster, no KO');
  else if (!input.aiFirst && input.playerOhkos) parts.push('Slower and OHKO\'d on the switch');
  if (input.immediateOhko) parts.push('KO\'d by a fast pivot on the way in');
  else if (input.immediateDamage && input.slowerAndTwoHko) parts.push('Hit by a fast pivot on the way in');
  return parts.join(' · ') || 'No send-in bonus';
}

function playerAttackInto(snapshot: BattleSnapshot, candidate: PokemonState): { ohko: boolean; hits: number; immediate: boolean; line?: MoveLine } {
  const player = snapshot.player.party[snapshot.player.active]!;
  let bestHits = 99;
  let ohko = false;
  let immediate = false;
  let line: MoveLine | undefined;
  const playerSpeed = speedOf(player, snapshot.field, snapshot.player.side);
  const aiSpeed = speedOf(candidate, snapshot.field, snapshot.opponent.side);
  const playerFirst = !aiMovesFirst(aiSpeed, playerSpeed, snapshot.field.trickRoom);
  for (const move of player.moves) {
    const estimate = estimateDamage(player, candidate, move, snapshot.field, snapshot.player.side, snapshot.opponent.side);
    if (estimate.category === 'Status' || estimate.max <= 0) continue;
    const hits = hitsToKo(estimate, candidate.curHp, candidate.disguiseIntact || candidate.substitute ? 1 : 0);
    const moveOhko = estimate.max >= candidate.curHp && !candidate.substitute;
    bestHits = Math.min(bestHits, hits);
    if (moveOhko) ohko = true;
    if (playerFirst && PIVOT_MOVES.has(move)) immediate = true;
    line = preferLine(line, { move, mean: estimate.mean, max: estimate.max, hits, ohko: moveOhko });
  }
  return { ohko, hits: bestHits, immediate, line };
}

function avoidSwitch(snapshot: BattleSnapshot): boolean {
  const ai = actingForme(snapshot.opponent.party[snapshot.opponent.active]!);
  const player = snapshot.player.party[snapshot.player.active]!;
  const boosted = ['atk', 'def', 'spa', 'spd', 'spe'].some((stat) => ai.boosts[stat as 'atk'] > 0);
  if (boosted) return true;
  if (aiCanKo(snapshot)) return true;
  return player.moves.some((move) => move === 'Pursuit' || PHAZING_MOVES.has(move) || OHKO_MOVES.has(move));
}

function aiCanKo(snapshot: BattleSnapshot): boolean {
  const ai = actingForme(snapshot.opponent.party[snapshot.opponent.active]!);
  const player = snapshot.player.party[snapshot.player.active]!;
  return ai.moves.some((move) => {
    const estimate = estimateDamage(ai, player, move, snapshot.field, snapshot.opponent.side, snapshot.player.side);
    return estimate.max >= player.curHp && !player.substitute;
  });
}

function aiIsFaster(snapshot: BattleSnapshot): boolean {
  const ai = actingForme(snapshot.opponent.party[snapshot.opponent.active]!);
  const player = snapshot.player.party[snapshot.player.active]!;
  return aiMovesFirst(speedOf(ai, snapshot.field, snapshot.opponent.side), speedOf(player, snapshot.field, snapshot.player.side), snapshot.field.trickRoom);
}

function playerCanKoActive(snapshot: BattleSnapshot): boolean {
  const ai = actingForme(snapshot.opponent.party[snapshot.opponent.active]!);
  const player = snapshot.player.party[snapshot.player.active]!;
  return player.moves.some((move) => estimateDamage(player, ai, move, snapshot.field, snapshot.player.side, snapshot.opponent.side).max >= ai.curHp);
}

/** A bench Pokémon whose immunity ability gains something from the player's last move. */
function immunitySwitch(snapshot: BattleSnapshot): { index: number; score: number; reason: string } | undefined {
  const player = snapshot.player.party[snapshot.player.active];
  const move = player?.lastMove ?? '';
  if (!player || !move) return undefined;
  const party = snapshot.opponent.party;
  const active = party[snapshot.opponent.active];
  if (active && grantsAbsorbAdvantage(active, move, player)) return undefined;
  for (let index = 0; index < party.length; index++) {
    const mon = party[index]!;
    if (index === snapshot.opponent.active || mon.fainted || mon.curHp <= 0 || unavailableForme(party, index, snapshot.opponent.active)) continue;
    if (!grantsAbsorbAdvantage(mon, move, player)) continue;
    const score = scoreCandidate(snapshot, mon, player).score;
    if (score < 0) continue;
    const forme = actingForme(mon);
    return { index, score, reason: `Immunity: ${forme.species}'s ${mon.ability} absorbs ${move}` };
  }
  return undefined;
}

const WIND_MOVES = new Set(['Air Cutter', 'Bleakwind Storm', 'Blizzard', 'Fairy Wind', 'Gust', 'Heat Wave', 'Hurricane', 'Icy Wind', 'Petal Blizzard', 'Sandstorm', 'Springtide Storm', 'Tailwind', 'Twister', 'Whirlwind', 'Wildbolt Storm']);

function grantsAbsorbAdvantage(mon: PokemonState, move: string, user: PokemonState): boolean {
  const absorbed = ABSORB[mon.ability];
  if (!absorbed) return false;
  const meta = moveMeta(move, user);
  const matches = absorbed.wind ? WIND_MOVES.has(move) : meta.type === absorbed.type;
  return matches && absorbed.advantage(mon);
}

function canHeal(mon: PokemonState): boolean {
  return mon.curHp <= maxHpOf(mon) * 0.75;
}

function hasDamaging(mon: PokemonState, category: 'Physical' | 'Special', type?: string): boolean {
  return mon.moves.some((move) => {
    const meta = moveMeta(move, mon);
    return meta.category === category && meta.bp > 0 && (!type || meta.type === type);
  });
}

const ABSORB: Record<string, { type: string; wind?: boolean; advantage: (mon: PokemonState) => boolean }> = {
  'Water Absorb': { type: 'Water', advantage: canHeal },
  'Volt Absorb': { type: 'Electric', advantage: canHeal },
  'Earth Eater': { type: 'Ground', advantage: canHeal },
  'Dry Skin': { type: 'Water', advantage: canHeal },
  'Storm Drain': { type: 'Water', advantage: (mon) => mon.boosts.spa < 6 && hasDamaging(mon, 'Special') },
  'Lightning Rod': { type: 'Electric', advantage: (mon) => mon.boosts.spa < 6 && hasDamaging(mon, 'Special') },
  'Sap Sipper': { type: 'Grass', advantage: (mon) => mon.boosts.atk < 6 && hasDamaging(mon, 'Physical') },
  'Motor Drive': { type: 'Electric', advantage: (mon) => mon.boosts.spe < 6 },
  'Well-Baked Body': { type: 'Fire', advantage: (mon) => mon.boosts.def < 6 },
  'Wind Rider': { type: '', wind: true, advantage: (mon) => mon.boosts.atk < 6 },
  'Flash Fire': { type: 'Fire', advantage: (mon) => hasDamaging(mon, 'Physical', 'Fire') || hasDamaging(mon, 'Special', 'Fire') },
};

function walled(snapshot: BattleSnapshot, bestDamageRatio: number): boolean {
  const player = snapshot.player.party[snapshot.player.active]!;
  const bulky = player.item === 'Leftovers' || player.item === 'Black Sludge' || player.leechSeeded || player.ability === 'Poison Heal';
  return bestDamageRatio <= (bulky ? 0.2 : 0.1);
}

function weatherLapsed(ai: PokemonState, snapshot: BattleSnapshot): boolean {
  const wanted = WEATHER_ABILITY[ai.ability];
  if (!wanted) return false;
  if (wanted.kind === 'weather') return snapshot.field.weather !== wanted.name;
  return snapshot.field.terrain !== wanted.name;
}

const WEATHER_ABILITY: Record<string, { kind: 'weather' | 'terrain'; name: string }> = {
  Drought: { kind: 'weather', name: 'Sun' },
  Drizzle: { kind: 'weather', name: 'Rain' },
  'Sand Stream': { kind: 'weather', name: 'Sand' },
  'Snow Warning': { kind: 'weather', name: 'Snow' },
  'Orichalcum Pulse': { kind: 'weather', name: 'Sun' },
  'Electric Surge': { kind: 'terrain', name: 'Electric' },
  'Grassy Surge': { kind: 'terrain', name: 'Grassy' },
  'Psychic Surge': { kind: 'terrain', name: 'Psychic' },
  'Misty Surge': { kind: 'terrain', name: 'Misty' },
  'Hadron Engine': { kind: 'terrain', name: 'Electric' },
};

export function activeTypes(mon: PokemonState): string[] {
  return typesOf(mon);
}

export function hpOf(mon: PokemonState): number {
  return maxHpOf(mon);
}
