import { applyProtean, estimateDamage, koChance, maxHpOf, moveMeta, speedOf } from '../calc/damage';
import { residualChip, type ResidualChoice } from '../calc/residual';
import { postKoSendIn, type PostKoSendIn } from '../ai/switch';
import { actingForme, unavailableForme } from '../calc/forme';
import type { BattleSnapshot } from '../state/types';

export interface AfterKoChoice extends ResidualChoice {
  playerMove: string;
  /** Empty when their attack does not land before the KO. */
  opponentMove: string;
  /** When set, switch-in scores use this HP instead of the chipped line. */
  customHp?: number;
}

export interface AfterKoReport {
  kos: boolean;
  koChance: number;
  playerHp: number;
  maxHp: number;
  youFaint: boolean;
  chips: string[];
  order: string;
  sendIns: PostKoSendIn[];
  note: string;
}

export function afterKo(snapshot: BattleSnapshot, choice: AfterKoChoice): AfterKoReport {
  const player = snapshot.player.party[snapshot.player.active];
  const rawAi = snapshot.opponent.party[snapshot.opponent.active];
  const ai = rawAi ? actingForme(rawAi) : undefined;
  const empty: AfterKoReport = {
    kos: false,
    koChance: 0,
    playerHp: player?.curHp ?? 0,
    maxHp: player ? maxHpOf(player) : 0,
    youFaint: false,
    chips: [],
    order: '',
    sendIns: [],
    note: 'Set the active Pokémon on both sides.',
  };
  if (!player || !ai) return empty;
  if (!choice.playerMove) return { ...empty, note: 'Choose the move you use to KO.' };
  const estimate = estimateDamage(player, ai, choice.playerMove, snapshot.field, snapshot.player.side, snapshot.opponent.side);
  const chance = koChance(estimate.rolls, ai.curHp);
  if (chance <= 0) {
    return { ...empty, note: `${choice.playerMove} does not KO ${ai.species}.` };
  }
  const order = moveOrder(snapshot, choice.playerMove, choice.opponentMove);
  const maxHp = maxHpOf(player);
  const usingCustomHp = choice.customHp !== undefined;
  let hp = player.curHp;
  const chips: string[] = [];
  if (usingCustomHp) {
    hp = Math.max(1, Math.min(maxHp, Math.round(choice.customHp!)));
  } else {
    if (choice.opponentMove) {
      const incoming = estimateDamage(ai, player, choice.opponentMove, snapshot.field, snapshot.opponent.side, snapshot.player.side);
      const dealt = Math.round(incoming.mean);
      if (dealt > 0) {
        hp -= dealt;
        chips.push(`${choice.opponentMove} ${dealt}`);
      }
    }
    for (const part of residualChip(player, choice)) {
      hp -= part.amount;
      chips.push(`${part.label} ${part.amount}`);
    }
  }
  if (hp <= 0) {
    return {
      kos: true,
      koChance: chance,
      playerHp: 0,
      maxHp,
      youFaint: true,
      chips,
      order,
      sendIns: [],
      note: `${choice.playerMove} can KO, but this line faints you first${chips.length ? ` (${chips.join(', ')})` : ''}.`,
    };
  }
  const bench = snapshot.opponent.party.filter((mon, index) => index !== snapshot.opponent.active && !mon.fainted && mon.curHp > 0 && !unavailableForme(snapshot.opponent.party, index, snapshot.opponent.active));
  const faced = applyProtean({ ...player, curHp: hp }, choice.playerMove);
  const forSendIn: BattleSnapshot = {
    ...snapshot,
    player: {
      ...snapshot.player,
      party: snapshot.player.party.map((mon, index) => (index === snapshot.player.active ? faced : mon)),
    },
  };
  const sendIns = bench.length ? postKoSendIn(forSendIn, hp) : [];
  const chipText = chips.length ? ` after ${chips.join(', ')}` : '';
  const hpText = usingCustomHp ? `custom HP ${hp}/${maxHp}` : `${hp}/${maxHp}${chipText}`;
  const koText = chance < 1 ? `${choice.playerMove} KOs on ${Math.round(chance * 100)}% of rolls` : `${choice.playerMove} KOs`;
  const note = bench.length
    ? `${koText}. You are at ${hpText}. ${order}`
    : `${koText}. ${ai.species} is their last Pokémon.`;
  return { kos: true, koChance: chance, playerHp: hp, maxHp, youFaint: false, chips, order, sendIns, note };
}

function moveOrder(snapshot: BattleSnapshot, playerMove: string, opponentMove: string): string {
  if (!opponentMove) return 'They do not hit you before fainting.';
  const player = snapshot.player.party[snapshot.player.active]!;
  const ai = actingForme(snapshot.opponent.party[snapshot.opponent.active]!);
  const playerPriority = moveMeta(playerMove, player).priority;
  const aiPriority = moveMeta(opponentMove, ai).priority;
  if (playerPriority !== aiPriority) {
    return playerPriority > aiPriority
      ? 'You move first. Their hit is included because you selected it.'
      : 'They move first.';
  }
  const playerSpeed = speedOf(player, snapshot.field, snapshot.player.side);
  const aiSpeed = speedOf(ai, snapshot.field, snapshot.opponent.side);
  if (playerSpeed === aiSpeed) return 'Speed tie. Their hit is included because you selected it.';
  const trick = snapshot.field.trickRoom;
  const playerFaster = trick ? playerSpeed < aiSpeed : playerSpeed > aiSpeed;
  return playerFaster ? 'You move first. Their hit is included because you selected it.' : 'They move first.';
}
