import { estimateDamage, koChance, maxHpOf, moveMeta, speedOf, type DamageEstimate } from '../calc/damage';
import { actingForme } from '../calc/forme';
import { hazardDamage } from '../calc/hazards';
import { PROTECT_MOVES } from '../data/null-moves';
import type { PredictedAction } from '../ai/predict';
import type { BattleSnapshot, PokemonState } from '../state/types';

export interface Reply {
  label: string;
  kind: 'move' | 'switch';
  faintRisk: number;
  koChance: number;
  expectedDamage: number;
  reason: string;
}

const BREAKS_PROTECT = new Set(['Feint', 'Shadow Force', 'Phantom Force', 'Hyper Drill', 'Mighty Cleave']);

export function rankReplies(snapshot: BattleSnapshot, opponent: PredictedAction[]): Reply[] {
  const player = snapshot.player.party[snapshot.player.active];
  const rawAi = snapshot.opponent.party[snapshot.opponent.active];
  const ai = rawAi ? actingForme(rawAi) : undefined;
  if (!player || !ai) return [];
  const actions: { kind: 'move' | 'switch'; label: string; move?: string; index?: number }[] = player.moves.filter(Boolean).map((move) => ({
    kind: 'move',
    label: move,
    move,
  }));
  snapshot.player.party.forEach((mon, index) => {
    if (index === snapshot.player.active || mon.fainted || mon.curHp <= 0) return;
    actions.push({ kind: 'switch', label: `Switch to ${mon.species}`, index });
  });
  const replies = actions.map((action) => scoreAction(snapshot, action, opponent));
  replies.sort((a, b) => a.faintRisk - b.faintRisk || b.koChance - a.koChance || b.expectedDamage - a.expectedDamage);
  return replies;
}

function scoreAction(
  snapshot: BattleSnapshot,
  action: { kind: 'move' | 'switch'; label: string; move?: string; index?: number },
  opponent: PredictedAction[],
): Reply {
  let faintRisk = 0;
  let ko = 0;
  let damage = 0;
  let worst = opponent[0];
  let worstFaint = -1;
  for (const threat of opponent) {
    if (threat.probability <= 0) continue;
    const line = resolve(snapshot, action, threat);
    faintRisk += threat.probability * line.faint;
    ko += threat.probability * line.ko;
    damage += threat.probability * line.damage;
    if (line.faint > worstFaint) {
      worstFaint = line.faint;
      worst = threat;
    }
  }
  const reason = worst
    ? faintRisk > 0
      ? `${Math.round(faintRisk * 100)}% faint risk, mostly into ${worst.label}`
      : `Lives ${worst.label}`
    : 'No opponent action';
  return { label: action.label, kind: action.kind, faintRisk, koChance: ko, expectedDamage: damage, reason };
}

function resolve(
  snapshot: BattleSnapshot,
  action: { kind: 'move' | 'switch'; move?: string; index?: number },
  threat: PredictedAction,
): { faint: number; ko: number; damage: number } {
  const ai = actingForme(snapshot.opponent.party[snapshot.opponent.active]!);
  const player = snapshot.player.party[snapshot.player.active]!;
  if (action.kind === 'switch' && threat.kind === 'switch') {
    const incoming = snapshot.player.party[action.index!]!;
    const chip = hazardDamage(incoming, snapshot.player.side);
    return { faint: chip >= incoming.curHp ? 1 : 0, ko: 0, damage: 0 };
  }
  if (action.kind === 'switch' && threat.kind === 'move') {
    const incoming = snapshot.player.party[action.index!]!;
    const chip = hazardDamage(incoming, snapshot.player.side);
    const hp = incoming.curHp - chip;
    if (hp <= 0) return { faint: 1, ko: 0, damage: 0 };
    const estimate = estimateDamage(ai, { ...incoming, curHp: hp }, threat.move!, snapshot.field, snapshot.opponent.side, snapshot.player.side);
    return { faint: faintChance(incoming, estimate, hp), ko: 0, damage: 0 };
  }
  if (action.kind === 'move' && threat.kind === 'switch') {
    const incoming = actingForme(snapshot.opponent.party[threat.switchIndex!]!);
    const chip = hazardDamage(incoming, snapshot.opponent.side);
    const hp = incoming.curHp - chip;
    if (hp <= 0) return { faint: 0, ko: 1, damage: chip };
    const estimate = estimateDamage(player, { ...incoming, curHp: hp }, action.move!, snapshot.field, snapshot.player.side, snapshot.opponent.side);
    const ko = faintChance(incoming, estimate, hp);
    return { faint: 0, ko, damage: Math.min(hp, estimate.mean) };
  }
  const playerMove = action.move!;
  const aiMove = threat.move!;
  const playerEstimate = estimateDamage(player, ai, playerMove, snapshot.field, snapshot.player.side, snapshot.opponent.side);
  const aiEstimate = estimateDamage(ai, player, aiMove, snapshot.field, snapshot.opponent.side, snapshot.player.side);
  const protectedTurn = PROTECT_MOVES.has(playerMove) && !BREAKS_PROTECT.has(aiMove);
  const playerKo = faintChance(ai, playerEstimate, ai.curHp);
  const aiKo = protectedTurn ? 0 : faintChance(player, aiEstimate, player.curHp);
  const first = mover(player, playerMove, ai, aiMove, snapshot);
  const playerFirst = first === 'player' ? 1 : first === 'opponent' ? 0 : 0.5;
  const faint = playerFirst * (1 - playerKo) * aiKo + (1 - playerFirst) * aiKo;
  const ko = playerFirst * playerKo + (1 - playerFirst) * (1 - aiKo) * playerKo;
  const expected = (playerFirst + (1 - playerFirst) * (1 - aiKo)) * Math.min(ai.curHp, playerEstimate.mean);
  return { faint, ko, damage: expected };
}

function faintChance(mon: PokemonState, estimate: DamageEstimate, hp: number): number {
  const full = hp >= maxHpOf(mon);
  const endure = (mon.item === 'Focus Sash' || mon.ability === 'Sturdy') && full && estimate.hits <= 1;
  if (endure) return 0;
  return koChance(estimate.rolls, hp);
}

function mover(player: PokemonState, playerMove: string, ai: PokemonState, aiMove: string, snapshot: BattleSnapshot): 'player' | 'opponent' | 'tie' {
  const playerPriority = moveMeta(playerMove, player).priority;
  const aiPriority = moveMeta(aiMove, ai).priority;
  if (playerPriority !== aiPriority) return playerPriority > aiPriority ? 'player' : 'opponent';
  const playerSpeed = speedOf(player, snapshot.field, snapshot.player.side);
  const aiSpeed = speedOf(ai, snapshot.field, snapshot.opponent.side);
  const trick = snapshot.field.trickRoom;
  if (playerSpeed === aiSpeed) return 'tie';
  const playerFaster = trick ? playerSpeed < aiSpeed : playerSpeed > aiSpeed;
  return playerFaster ? 'player' : 'opponent';
}

export function hpLabel(mon: PokemonState): string {
  const max = maxHpOf(mon);
  return `${mon.curHp}/${max}`;
}
