import { ACCURACY_AT_MOST_70, CHOICE_STATUS_OK, KILL_ABILITY, NEVER_HDM, NO_KILL_BONUS, OHKO_MOVES } from '../data/null-moves';
import { chance, fixed, pick, type Clause } from './clause';
import { effectClauses } from './effects';
import type { ScoreFacts } from './facts';

const NO_STATUS_DEFAULT = new Set(['Nature Power', 'Memento']);

export interface MoveScore {
  clauses: Clause[];
  useless: boolean;
  /** A move the anti-setup switch treats as having no use. */
  worthless: boolean;
}

export function scoreMove(facts: ScoreFacts): MoveScore {
  const useless = uselessReason(facts);
  if (useless) return { clauses: [fixed(-20, useless)], useless: true, worthless: true };
  const clauses: Clause[] = [];
  const status = facts.category === 'Status';
  if (status && !NO_STATUS_DEFAULT.has(facts.move)) clauses.push(fixed(6, 'Status moves start at +6'));
  if (facts.move === 'Future Sight') clauses.push(fixed(6, 'Future Sight starts at +6'));
  const secondary = hasGuaranteedSecondary(facts.move) && !ACCURACY_AT_MOST_70.has(facts.move);
  if (secondary && !facts.isHdm && !status) clauses.push(fixed(6, 'Guaranteed secondary effect'));
  if (facts.isHdm && !NEVER_HDM.has(facts.move)) {
    clauses.push(pick('Highest damage move', [{ p: 0.75, delta: 6 }, { p: 0.25, delta: 8 }]));
  }
  if (facts.kills && !NO_KILL_BONUS.has(facts.move)) {
    const fast = facts.aiFirst || facts.priority > 0;
    clauses.push(fixed(fast ? 6 : 3, fast ? 'Fast kill' : 'Slow kill'));
    if (KILL_ABILITY.has(facts.ai.ability)) clauses.push(fixed(1, 'Kill boosts a stat'));
  }
  if (facts.priority > 0 && facts.move !== 'Feint' && !facts.aiFirst && facts.playerCanFaint && facts.category !== 'Status') {
    clauses.push(fixed(facts.isHdm ? 5 : 11, 'Priority while slower and dying'));
  } else if (facts.priority > 0 && facts.move !== 'Feint' && !facts.aiFirst && facts.ai.item === 'Eject Button' && facts.category !== 'Status') {
    clauses.push(fixed(11, 'Priority with Eject Button'));
  }
  if ((facts.ai.status === 'frz' || facts.ai.status === 'frb') && thaws(facts.move)) {
    clauses.push(fixed(12, 'Thaws the user'));
  }
  if (isChoice(facts.ai.item) && status && !CHOICE_STATUS_OK.has(facts.move)) {
    clauses.push(fixed(-20, 'Choice item avoids status'));
  }
  clauses.push(...effectClauses(facts));
  const worthless = clauses.every((clause) => clause.kind === 'fixed' && clause.delta < 0);
  return { clauses, useless: false, worthless };
}

function uselessReason(facts: ScoreFacts): string | null {
  const move = facts.move;
  if (move === 'Stealth Rock' && facts.playerSide.stealthRock) return 'Stealth Rock is already up';
  if ((move === 'Spikes' || move === 'Ceaseless Edge') && facts.playerSide.spikes >= 3) return 'Spikes are already at three layers';
  if (move === 'Toxic Spikes' && facts.playerSide.toxicSpikes >= 2) return 'Toxic Spikes are already at two layers';
  if (move === 'Sticky Web' && facts.playerSide.stickyWeb) return 'Sticky Web is already up';
  if (move === 'Light Screen' && facts.aiSide.lightScreen) return 'Light Screen is already up';
  if (move === 'Reflect' && facts.aiSide.reflect) return 'Reflect is already up';
  if (move === 'Aurora Veil' && facts.aiSide.auroraVeil) return 'Aurora Veil is already up';
  if (move === 'Tailwind' && facts.aiSide.tailwind) return 'Tailwind is already up';
  if (move === 'Trick Room' && facts.field.trickRoom) return 'Trick Room is already up';
  if (facts.field.weather && weatherMove(move) === facts.field.weather) return 'That weather is already active';
  if (facts.field.terrain && terrainMove(move) === facts.field.terrain) return 'That terrain is already active';
  if (statusAlready(facts)) return 'That status is already applied';
  if (facts.player.substitute && facts.category === 'Status' && !soundMove(move)) return 'Substitute blocks the status';
  if (OHKO_MOVES.has(move) && facts.player.level > facts.ai.level) return 'OHKO moves fail against a higher level';
  return null;
}

function statusAlready(facts: ScoreFacts): boolean {
  const status = facts.player.status;
  if (!status) return false;
  const move = facts.move;
  if (['Thunder Wave', 'Glare', 'Stun Spore', 'Nuzzle', 'Zap Cannon'].includes(move)) return status === 'par';
  if (['Will-O-Wisp', 'Sizzly Slide'].includes(move)) return status === 'brn';
  if (['Toxic', 'Poison Gas', 'Poison Powder', 'Toxic Thread'].includes(move)) return status === 'psn' || status === 'tox';
  if (['Hypnosis', 'Sleep Powder', 'Sing', 'Spore', 'Grass Whistle', 'Dark Void', 'Lovely Kiss'].includes(move)) return status === 'slp';
  if (move === 'Freezy Frost') return status === 'frb';
  return false;
}

function weatherMove(move: string): string {
  if (move === 'Sunny Day') return 'Sun';
  if (move === 'Rain Dance') return 'Rain';
  if (move === 'Sandstorm') return 'Sand';
  if (move === 'Snowscape' || move === 'Hail') return 'Snow';
  return '';
}

function terrainMove(move: string): string {
  if (move === 'Electric Terrain') return 'Electric';
  if (move === 'Grassy Terrain') return 'Grassy';
  if (move === 'Psychic Terrain') return 'Psychic';
  if (move === 'Misty Terrain') return 'Misty';
  return '';
}

function soundMove(move: string): boolean {
  return ['Sing', 'Supersonic', 'Growl', 'Roar', 'Snore', 'Perish Song', 'Screech', 'Metal Sound', 'Confide'].includes(move);
}

function thaws(move: string): boolean {
  return ['Flame Wheel', 'Flare Blitz', 'Sacred Fire', 'Scald', 'Steam Eruption', 'Burn Up', 'Pyro Ball', 'Scorching Sands', 'Matcha Gotcha'].includes(move);
}

function isChoice(item: string): boolean {
  return item === 'Choice Band' || item === 'Choice Specs' || item === 'Choice Scarf';
}

const GUARANTEED = new Set([
  'Nuzzle', 'Rock Smash', 'Mystical Fire', 'Lunge', 'Trop Kick', 'Skitter Smack', 'Chilling Water', 'Apple Acid',
  'Lumina Crash', 'Spirit Break', 'Breaking Swipe', 'Acid Spray', 'Electroweb', 'Icy Wind', 'Bulldoze', 'Mud Shot',
  'Rock Tomb', 'Glaciate', 'Drum Beating', 'Low Sweep', 'Pounce', 'Freezy Frost', 'Mortal Spin', 'Power-Up Punch',
  'Torch Song', 'Mystical Power', 'Flame Charge', 'Aqua Step', 'Trailblaze', 'Esper Wing', 'Scale Shot', 'Psyshield Bash',
]);

function hasGuaranteedSecondary(move: string): boolean {
  return GUARANTEED.has(move);
}

export function choiceLocked(item: string, locked: string, moves: string[]): string[] {
  if (locked && moves.includes(locked)) return [locked];
  if (isChoice(item) && locked) return [locked];
  return moves.filter(Boolean);
}
