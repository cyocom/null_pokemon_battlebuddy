import { estimateDamage, hitsToKo, maxHpOf, moveMeta, speedOf, typesOf, type DamageEstimate } from '../calc/damage';
import { actingForme, unavailableForme } from '../calc/forme';
import { aiMovesFirst } from '../calc/speed';
import { NEVER_HDM } from '../data/null-moves';
import type { BattleSnapshot, PokemonState } from '../state/types';
import { convolve, modalScore, winShares, type Clause } from './clause';
import type { ScoreFacts } from './facts';
import { scoreMove } from './score';
import { chooseSwitch, explainSwitchIn } from './switch';

export interface PredictedAction {
  kind: 'move' | 'switch';
  label: string;
  move?: string;
  switchIndex?: number;
  probability: number;
  modalScore: number;
  /** Min–max damage into your current HP. Empty for status moves and switches. */
  damage: string;
  reasons: string[];
}

export interface Prediction {
  actions: PredictedAction[];
  switchReason: string;
  unspecified: string[];
}

interface MoveRoll {
  name: string;
  estimate: DamageEstimate;
}

export function predictOpponent(snapshot: BattleSnapshot): Prediction {
  const rawAi = snapshot.opponent.party[snapshot.opponent.active];
  const ai = rawAi ? actingForme(rawAi) : undefined;
  const player = snapshot.player.party[snapshot.player.active];
  if (!ai || !player) {
    return { actions: [], switchReason: 'Set the active Pokémon on both sides.', unspecified: [] };
  }
  if (ai.fainted || player.fainted) {
    return { actions: [], switchReason: 'One of the active Pokémon has fainted.', unspecified: [] };
  }
  const legal = legalMoves(ai);
  const rolls = legal.map((name) => ({ name, estimate: estimateDamage(ai, player, name, snapshot.field, snapshot.opponent.side, snapshot.player.side) }));
  const shared = sharedFacts(snapshot, ai, player);
  const damaging = rolls.filter((roll) => roll.estimate.category !== 'Status');
  const moveProbability = new Map<string, number>();
  const samples = worlds(damaging);
  const sampleTotal = samples.reduce((sum, sample) => sum + sample.p, 0) || 1;
  for (const sample of samples) {
    const byMove = new Map(sample.damages);
    const hdm = highestDamage(rolls, byMove);
    const distributions = rolls.map((roll) => {
      const damage = byMove.get(roll.name) ?? 0;
      const facts = factsFor(shared, roll, damage, hdm.has(roll.name));
      return convolve(scoreMove(facts).clauses);
    });
    const shares = winShares(distributions);
    const weight = sample.p / sampleTotal;
    rolls.forEach((roll, index) => {
      moveProbability.set(roll.name, (moveProbability.get(roll.name) ?? 0) + weight * (shares[index] ?? 0));
    });
  }

  const modalDamages = new Map(rolls.map((roll) => [roll.name, modeDamage(roll.estimate)]));
  const modalHdm = highestDamage(rolls, modalDamages);
  const modalScores = rolls.map((roll) => {
    const facts = factsFor(shared, roll, modalDamages.get(roll.name) ?? 0, modalHdm.has(roll.name));
    const scored = scoreMove(facts);
    return { roll, scored, score: modalScore(convolve(scored.clauses)) };
  });
  const bestRatio = player.curHp <= 0 ? 1 : Math.max(0, ...rolls.map((roll) => roll.estimate.mean / Math.max(1, playerMax(player))));
  const decision = chooseSwitch(snapshot, modalScores.every((row) => row.scored.worthless), bestRatio);
  const stay = 1 - decision.probability;
  const actions: PredictedAction[] = modalScores.map((row) => {
    const described = describe(row.scored.clauses);
    return {
      kind: 'move' as const,
      label: row.roll.name,
      move: row.roll.name,
      probability: (moveProbability.get(row.roll.name) ?? 0) * stay,
      modalScore: row.score,
      damage: damageRange(row.roll.estimate, player.curHp),
      reasons: described.length ? described : ['No bonus'],
    };
  });
  for (const target of decision.targets) {
    const mon = snapshot.opponent.party[target.index];
    if (!mon) continue;
    const detail = explainSwitchIn(snapshot, mon, player);
    actions.push({
      kind: 'switch',
      label: `Switch to ${actingForme(mon).species}`,
      switchIndex: target.index,
      probability: decision.probability * target.probability,
      modalScore: target.score,
      damage: '',
      reasons: [decision.reason, ...detail.reasons],
    });
  }
  actions.sort((a, b) => b.probability - a.probability);
  return { actions, switchReason: decision.reason, unspecified: decision.unspecified };
}

function damageRange(estimate: DamageEstimate, hp: number): string {
  if (estimate.category === 'Status' || estimate.max <= 0) return '';
  const range = estimate.min === estimate.max ? String(estimate.min) : `${estimate.min}–${estimate.max}`;
  if (hp <= 0) return range;
  const low = (estimate.min / hp) * 100;
  const high = (estimate.max / hp) * 100;
  const share = low === high ? `${low.toFixed(1)}%` : `${low.toFixed(1)}–${high.toFixed(1)}%`;
  return `${range} (${share})`;
}

function legalMoves(ai: PokemonState): string[] {
  const moves = ai.moves.filter(Boolean);
  if (ai.lockedMove && moves.includes(ai.lockedMove)) return [ai.lockedMove];
  return moves;
}

function sharedFacts(snapshot: BattleSnapshot, ai: PokemonState, player: PokemonState) {
  const aiSpeed = speedOf(ai, snapshot.field, snapshot.opponent.side);
  const playerSpeed = speedOf(player, snapshot.field, snapshot.player.side);
  const aiFirst = aiMovesFirst(aiSpeed, playerSpeed, snapshot.field.trickRoom);
  const paralyzedSpeed = player.status === 'par' ? playerSpeed : Math.floor(playerSpeed * 0.25);
  const paraFlipsSpeed = !aiFirst && aiMovesFirst(aiSpeed, paralyzedSpeed, snapshot.field.trickRoom);
  let playerHits = 99;
  let playerMax = 0;
  let playerPhysical = false;
  let playerSpecial = false;
  for (const move of player.moves) {
    const estimate = estimateDamage(player, ai, move, snapshot.field, snapshot.player.side, snapshot.opponent.side);
    const meta = moveMeta(move, player);
    if (meta.category === 'Physical' && meta.bp > 0) playerPhysical = true;
    if (meta.category === 'Special' && meta.bp > 0) playerSpecial = true;
    playerHits = Math.min(playerHits, hitsToKo(estimate, ai.curHp, ai.disguiseIntact || ai.substitute ? 1 : 0));
    playerMax = Math.max(playerMax, estimate.max);
  }
  const aiMaxKills = ai.moves.some((move) => {
    const estimate = estimateDamage(ai, player, move, snapshot.field, snapshot.opponent.side, snapshot.player.side);
    return estimate.max >= player.curHp && !player.substitute && !(player.disguiseIntact && estimate.hits <= 1);
  });
  return {
    snapshot,
    ai,
    player,
    aiFirst,
    paraFlipsSpeed,
    playerHits,
    playerCanFaint: playerHits <= 1,
    playerFastTwoHit: !aiFirst && playerHits <= 2,
    playerPhysical,
    playerSpecial,
    aiMaxKills,
    aiTypes: typesOf(ai),
    playerTypes: typesOf(player),
    aiMaxHp: maxHpOf(ai),
    playerMaxHp: maxHpOf(player),
    playerMaxRoll: playerMax,
  };
}

function factsFor(
  shared: ReturnType<typeof sharedFacts>,
  roll: MoveRoll,
  damage: number,
  isHdm: boolean,
): ScoreFacts {
  const blocked = shared.player.substitute || (shared.player.disguiseIntact && roll.estimate.hits <= 1);
  const kills = !blocked && damage >= shared.player.curHp && damage > 0;
  return {
    ai: shared.ai,
    player: shared.player,
    field: shared.snapshot.field,
    aiSide: shared.snapshot.opponent.side,
    playerSide: shared.snapshot.player.side,
    move: roll.name,
    category: roll.estimate.category,
    type: roll.estimate.type,
    bp: roll.estimate.bp,
    priority: roll.estimate.priority,
    hits: roll.estimate.hits,
    damage,
    isHdm,
    kills,
    aiFirst: shared.aiFirst,
    playerCanFaint: shared.playerCanFaint,
    playerHits: shared.playerHits,
    playerFastTwoHit: shared.playerFastTwoHit,
    aiMaxKills: shared.aiMaxKills,
    moveHits: hitsToKo(roll.estimate, shared.player.curHp, shared.player.disguiseIntact || shared.player.substitute ? 1 : 0),
    aiLastMon: living(shared.snapshot.opponent.party, shared.snapshot.opponent.active) <= 1,
    playerLastMon: living(shared.snapshot.player.party, shared.snapshot.player.active) <= 1,
    incapacitated: shared.player.status === 'slp' || shared.player.status === 'frz',
    playerPhysical: shared.playerPhysical,
    playerSpecial: shared.playerSpecial,
    aiTypes: shared.aiTypes,
    playerTypes: shared.playerTypes,
    aiMaxHp: shared.aiMaxHp,
    playerMaxHp: shared.playerMaxHp,
    paraFlipsSpeed: shared.paraFlipsSpeed,
    allyLowHp: shared.snapshot.opponent.party.some((mon, index) => !unavailableForme(shared.snapshot.opponent.party, index, shared.snapshot.opponent.active) && !mon.fainted && mon.curHp < maxHpOf(mon) * 0.65),
    partyStatus: shared.snapshot.opponent.party.some((mon, index) => !unavailableForme(shared.snapshot.opponent.party, index, shared.snapshot.opponent.active) && !mon.fainted && mon.status),
    estimate: roll.estimate,
  };
}

function highestDamage(rolls: MoveRoll[], damages: Map<string, number>): Set<string> {
  let best = 0;
  for (const roll of rolls) {
    if (NEVER_HDM.has(roll.name) || roll.estimate.category === 'Status') continue;
    best = Math.max(best, damages.get(roll.name) ?? 0);
  }
  const winners = new Set<string>();
  if (best <= 0) return winners;
  for (const roll of rolls) {
    if (NEVER_HDM.has(roll.name) || roll.estimate.category === 'Status') continue;
    if ((damages.get(roll.name) ?? 0) === best) winners.add(roll.name);
  }
  return winners;
}

function worlds(damaging: MoveRoll[]): { damages: [string, number][]; p: number }[] {
  const eligible = damaging.filter((roll) => roll.estimate.weights.length);
  if (!eligible.length) return [{ damages: [], p: 1 }];
  const product = eligible.reduce((count, roll) => count * roll.estimate.weights.length, 1);
  if (product <= 4096) {
    const out: { damages: [string, number][]; p: number }[] = [];
    const walk = (index: number, damages: [string, number][], p: number) => {
      if (index === eligible.length) {
        out.push({ damages, p });
        return;
      }
      const roll = eligible[index]!;
      for (const weight of roll.estimate.weights) walk(index + 1, [...damages, [roll.name, weight.damage]], p * weight.p);
    };
    walk(0, [], 1);
    return out;
  }
  const random = mulberry32(0x4e756c6c);
  const samples = 2000;
  const out: { damages: [string, number][]; p: number }[] = [];
  for (let i = 0; i < samples; i++) {
    const damages: [string, number][] = eligible.map((roll) => [roll.name, pickWeighted(roll.estimate.weights, random())]);
    out.push({ damages, p: 1 / samples });
  }
  return out;
}

function pickWeighted(weights: { damage: number; p: number }[], roll: number): number {
  let cursor = 0;
  for (const weight of weights) {
    cursor += weight.p;
    if (roll <= cursor) return weight.damage;
  }
  return weights[weights.length - 1]?.damage ?? 0;
}

function modeDamage(estimate: DamageEstimate): number {
  return estimate.weights.reduce((best, weight) => (weight.p > best.p ? weight : best), estimate.weights[0] ?? { damage: 0, p: 0 }).damage;
}

function describe(clauses: Clause[]): string[] {
  return clauses.map((clause) => {
    if (clause.kind === 'fixed') {
      const sign = clause.delta > 0 ? `+${clause.delta}` : `${clause.delta}`;
      return `${clause.reason} (${sign})`;
    }
    const parts = clause.options
      .filter((option) => option.delta !== 0)
      .map((option) => `${Math.round(option.p * 100)}% ${option.delta > 0 ? '+' : ''}${option.delta}`);
    return parts.length ? `${clause.reason}: ${parts.join(', ')}` : clause.reason;
  });
}

function living(party: PokemonState[], active: number): number {
  return party.filter((mon, index) => !unavailableForme(party, index, active) && !mon.fainted && mon.curHp > 0).length;
}

function playerMax(player: PokemonState): number {
  return maxHpOf(player);
}

function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
