import { PROTECT_MOVES, PHAZING_MOVES, OHKO_MOVES } from '../data/null-moves';
import { chance, fixed, gate, pick, type Clause } from './clause';
import { hasAny, hasMove, type ScoreFacts } from './facts';

const OFFENSIVE = new Set([
  'Tidy Up', 'Dragon Dance', 'Shift Gear', 'Howl', 'Meditate', 'Sharpen', 'Swords Dance', 'Growth',
  'Nasty Plot', 'Tail Glow', 'Hone Claws', 'Work Up', 'Power-Up Punch', 'Mystical Power', 'Torch Song',
]);
const DEFENSIVE = new Set([
  'Stuff Cheeks', 'Harden', 'Withdraw', 'Barrier', 'Acid Armor', 'Iron Defense', 'Cotton Guard', 'Shelter',
  'Amnesia', 'Defense Curl', 'Stockpile', 'Cosmic Power', 'Psyshield Bash',
]);
const PHYSICAL_MIXED = new Set(['No Retreat', 'Victory Dance', 'Coil', 'Bulk Up', 'Curse', 'Superpower']);
const SPECIAL_MIXED = new Set(['Calm Mind', 'Quiver Dance']);
const SPEED_SETUP = new Set([
  'Autotomize', 'Agility', 'Rock Polish', 'Trailblaze', 'Flame Charge', 'Aqua Step', 'Esper Wing', 'Scale Shot', 'Rapid Spin',
]);
const SLEEP = new Set(['Sing', 'Dark Void', 'Yawn', 'Hypnosis', 'Sleep Powder', 'Spore', 'Grass Whistle', 'Lovely Kiss']);
const POISON = new Set(['Poison Gas', 'Toxic', 'Poison Powder', 'Toxic Thread']);
const PARALYSIS = new Set(['Nuzzle', 'Thunder Wave', 'Glare', 'Stun Spore', 'Zap Cannon', 'Nuzzle']);
const BURN = new Set(['Will-O-Wisp', 'Sizzly Slide']);
const CONFUSE = new Set(['Confuse Ray', 'Supersonic', 'Swagger', 'Flatter', 'Sweet Kiss', 'Teeter Dance']);
const SPEED_DROP = new Set([
  'Scary Face', 'Electroweb', 'Syrup Bomb', 'String Shot', 'Cotton Spore', 'Rock Tomb', 'Icy Wind', 'Mud Shot',
  'Bulldoze', 'Low Sweep', 'Drum Beating', 'Glaciate', 'Pounce',
]);
const STAT_DROP: Record<string, 'atk' | 'def' | 'spa' | 'spd'> = {
  Charm: 'atk', Growl: 'atk', 'Baby-Doll Eyes': 'atk', Lunge: 'atk', 'Trop Kick': 'atk', 'Chilling Water': 'atk', 'Breaking Swipe': 'atk',
  Screech: 'def', 'Rock Smash': 'def', 'Tail Whip': 'def', Leer: 'def',
  'Metal Sound': 'spd', 'Lumina Crash': 'spd', 'Fake Tears': 'spd', 'Acid Spray': 'spd', 'Apple Acid': 'spd',
  Confide: 'spa', 'Mystical Fire': 'spa', 'Skitter Smack': 'spa', 'Spirit Break': 'spa',
};
const RECOVERY = new Set(['Recover', 'Slack Off', 'Heal Order', 'Roost', 'Strength Sap', 'Soft-Boiled', 'Milk Drink', 'Moonlight', 'Synthesis', 'Morning Sun', 'Rest', 'Pain Split', 'Shore Up', 'Heal Pulse']);
const DRAIN = new Set(['Giga Drain', 'Draining Kiss', 'Drain Punch', 'Horn Leech', 'Parabolic Charge', 'Bitter Blade', 'Matcha Gotcha', 'Leech Life', 'Mega Drain', 'Absorb', 'Dream Eater']);
const BINDING = new Set(['Fire Spin', 'Whirlpool', 'Snap Trap', 'Sand Tomb', 'Infestation', 'Wrap', 'Bind', 'Magma Storm', 'Thunder Cage']);
const TRAP = new Set(['Octolock', 'Mean Look', 'Anchor Shot', 'Spirit Shackle', 'Thousand Waves', 'Jaw Lock', 'Block', 'Spider Web']);
const CHARGE_STRONG = new Set(['Geomancy', 'Meteor Beam', 'Electro Shot', 'Sky Attack', 'Freeze Shock', 'Ice Burn']);
const RECHARGE = new Set(['Hyper Beam', 'Blast Burn', 'Hydro Cannon', 'Frenzy Plant', 'Giga Impact', 'Rock Wrecker', 'Roar of Time', 'Prismatic Laser', 'Meteor Assault', 'Eternabeam']);
const HAZARDS = new Set(['Stealth Rock', 'Stone Axe', 'Spikes', 'Ceaseless Edge', 'Toxic Spikes']);
const PIVOT = new Set(['U-turn', 'Volt Switch', 'Flip Turn']);
const EXPLOSION = new Set(['Explosion', 'Self-Destruct', 'Misty Explosion', 'Memento']);
const SETUP_HATE = new Set(['Unaware']);
const SETUP_HATE_MOVES = ['Haze', 'Clear Smog', 'Freezy Frost', 'Topsy-Turvy'];

const SECONDARY: Record<string, 'para' | 'burn' | 'poison' | 'frost' | 'atk' | 'def' | 'spa' | 'spd' | 'spe' | 'confuse'> = {
  Nuzzle: 'para',
  'Rock Smash': 'def',
  'Mystical Fire': 'spa',
  Lunge: 'atk',
  'Trop Kick': 'atk',
  'Skitter Smack': 'spa',
  'Chilling Water': 'atk',
  'Apple Acid': 'spd',
  'Lumina Crash': 'spd',
  'Spirit Break': 'spa',
  'Breaking Swipe': 'atk',
  'Acid Spray': 'spd',
  Electroweb: 'spe',
  'Icy Wind': 'spe',
  Bulldoze: 'spe',
  'Mud Shot': 'spe',
  'Rock Tomb': 'spe',
  Glaciate: 'spe',
  'Drum Beating': 'spe',
  'Low Sweep': 'spe',
  Pounce: 'spe',
  'Freezy Frost': 'frost',
  'Mortal Spin': 'poison',
};

export function effectClauses(facts: ScoreFacts): Clause[] {
  const move = facts.move;
  const clauses: Clause[] = [];
  const specific = specificFamily(facts, clauses);
  if (!specific && SECONDARY[move] && !facts.isHdm && facts.category !== 'Status') {
    followSecondary(facts, SECONDARY[move], clauses);
  }
  return clauses;
}

function specificFamily(facts: ScoreFacts, clauses: Clause[]): boolean {
  const move = facts.move;
  if (move === 'Curse' && facts.aiTypes.includes('Ghost')) {
    ghostCurse(facts, clauses);
    return true;
  }
  if (contrarySetup(facts)) return contraryFamily(facts, clauses) || false;
  if (OFFENSIVE.has(move)) return offensive(facts, clauses, offensiveStat(move)), true;
  if (DEFENSIVE.has(move)) return defensive(facts, clauses, defensiveKind(move)), true;
  if (PHYSICAL_MIXED.has(move) || SPECIAL_MIXED.has(move)) return mixed(facts, clauses), true;
  if (SPEED_SETUP.has(move)) return speedSetup(facts, clauses), true;
  if (move === 'Double Team' || move === 'Minimize') return evasion(facts, clauses), true;
  if (CHARGE_STRONG.has(move)) return chargeMove(facts, clauses), true;
  if (SLEEP.has(move)) return sleep(facts, clauses), true;
  if (POISON.has(move)) return poison(facts, clauses), true;
  if (PARALYSIS.has(move)) return paralysis(facts, clauses), true;
  if (BURN.has(move) || move === 'Freezy Frost') return burn(facts, clauses, move === 'Freezy Frost'), true;
  if (CONFUSE.has(move)) return confusion(facts, clauses), true;
  if (SPEED_DROP.has(move)) return speedDrop(facts, clauses), true;
  if (STAT_DROP[move]) return statDrop(facts, clauses, STAT_DROP[move]), true;
  if (move === 'Flash' || move === 'Sand Attack' || move === 'Smokescreen' || move === 'Kinesis' || move === 'Mud-Slap') return accuracyDrop(facts, clauses), true;
  if (HAZARDS.has(move)) return hazards(facts, clauses), true;
  if (move === 'Sticky Web') return sticky(facts, clauses), true;
  if (move === 'Tailwind') return tailwind(facts, clauses), true;
  if (move === 'Trick Room') return trickRoom(facts, clauses), true;
  if (EXPLOSION.has(move)) return explosion(facts, clauses), true;
  if (move === 'Final Gambit') return finalGambit(facts, clauses), true;
  if (move === 'Baton Pass') return baton(facts, clauses), true;
  if (PIVOT.has(move) || move === 'Parting Shot') return pivot(facts, clauses), true;
  if (move === 'Knock Off') return knockOff(facts, clauses), true;
  if (move === 'Light Screen' || move === 'Reflect' || move === 'Aurora Veil') return screens(facts, clauses), true;
  if (move === 'Secret Power') return secretPower(facts, clauses), true;
  if (OHKO_MOVES.has(move)) return ohko(facts, clauses), true;
  if (BINDING.has(move)) return binding(facts, clauses), true;
  if (move === 'Salt Cure') return saltCure(facts, clauses), true;
  if (TRAP.has(move)) return trapping(facts, clauses), true;
  if (RECOVERY.has(move)) return recovery(facts, clauses), true;
  if (isDrain(move)) return drain(facts, clauses), true;
  if (move === 'Copycat' || move === 'Mirror Move' || move === 'Me First') return copyMove(facts, clauses), true;
  if (move === 'Roar' || move === 'Whirlwind') return roar(facts, clauses), true;
  if (move === 'Dragon Tail' || move === 'Circle Throw') return phazeContact(facts, clauses), true;
  if (move === 'Conversion') return clauses.push(fixed(2, 'Conversion changes type')), true;
  if (move === 'Conversion 2') return conversion2(facts, clauses), true;
  if (move === 'Laser Focus') return laser(facts, clauses), true;
  if (move === 'Focus Energy') return focusEnergy(facts, clauses), true;
  if (move === 'Shed Tail') return shedTail(facts, clauses), true;
  if (move === 'Substitute') return substitute(facts, clauses), true;
  if (move === 'Leech Seed') return leech(facts, clauses), true;
  if (move === 'Teleport' || move === 'Chilly Reception') return teleport(facts, clauses), true;
  if (move === 'Disable') return disable(facts, clauses), true;
  if (move === 'Encore') return encore(facts, clauses), true;
  if (move === 'Snore' || move === 'Sleep Talk') return sleepTalk(facts, clauses), true;
  if (move === 'Destiny Bond') return destinyBond(facts, clauses), true;
  if (move === 'Wish') return wish(facts, clauses), true;
  if (move === 'Aromatherapy' || move === 'Heal Bell') return healBell(facts, clauses), true;
  if (move === 'Nightmare') return nightmare(facts, clauses), true;
  if (move === 'Perish Song') return perish(facts, clauses), true;
  if (isWeatherMove(move)) return weather(facts, clauses), true;
  if (move === 'Attract') return attract(facts, clauses), true;
  if (move === 'Taunt') return taunt(facts, clauses), true;
  if (move === 'Rollout' || move === 'Ice Ball') return rollout(facts, clauses), true;
  if (move === 'Fury Cutter' || move === 'Echoed Voice') return fury(facts, clauses), true;
  if (PROTECT_MOVES.has(move)) return protect(facts, clauses), true;
  if (move === 'Endure') return endure(facts, clauses), true;
  if (move === 'Fake Out') return fakeOut(facts, clauses), true;
  if (move === 'Feint') return feint(facts, clauses), true;
  if (move === 'Upper Hand') return upperHand(facts, clauses), true;
  if (move === 'Pursuit') return pursuit(facts, clauses), true;
  if (move === 'Sucker Punch' || move === 'Thunderclap') return sucker(facts, clauses), true;
  if (move === 'Imprison') return imprison(facts, clauses), true;
  if (move === 'Wonder Room') return wonderRoom(facts, clauses), true;
  if (move === 'Mud Sport' || move === 'Water Sport' || move === 'Magic Room') return clauses.push(chance(0.25, 3, `${move} field effect`)), true;
  if (move === 'Gravity') return gravity(facts, clauses), true;
  if (move === 'Relic Song') return relic(facts, clauses), true;
  if (move === 'Powder') return powder(facts, clauses), true;
  if (move === 'Magnet Rise') return magnetRise(facts, clauses), true;
  if (move === 'Metronome') return metronome(facts, clauses), true;
  if (move === 'Fling') return fling(facts, clauses), true;
  if (move === 'Topsy-Turvy') return topsy(facts, clauses), true;
  if (move === 'Revival Blessing') return clauses.push(chance(0.5, 2, 'Revival Blessing')), true;
  if (move === 'Counter') return counter(facts, clauses, 'Physical'), true;
  if (move === 'Mirror Coat') return counter(facts, clauses, 'Special'), true;
  if (move === 'Metal Burst') return metalBurst(facts, clauses), true;
  if (move === 'Psych Up' || move === 'Spectral Thief') return psychUp(facts, clauses), true;
  if (RECHARGE.has(move)) return recharge(facts, clauses), true;
  if (move === 'Fell Stinger') return fellStinger(facts, clauses), true;
  if (move === 'Acupressure') return acupressure(facts, clauses), true;
  if (move === 'Charge') return charge(facts, clauses), true;
  if (move === 'Order Up') return orderUp(facts, clauses), true;
  return false;
}

function contrarySetup(facts: ScoreFacts): boolean {
  if (facts.ai.ability !== 'Contrary') return false;
  return ['Leaf Storm', 'Overheat', 'Draco Meteor', 'Superpower'].includes(facts.move);
}

function contraryFamily(facts: ScoreFacts, clauses: Clause[]): boolean {
  if (facts.move === 'Superpower') return mixed(facts, clauses), true;
  return offensive(facts, clauses, 'spa'), true;
}

function ghostCurse(facts: ScoreFacts, clauses: Clause[]): void {
  if (facts.player.cursed) clauses.push(fixed(-20, 'Target is already cursed'));
  else clauses.push(fixed(0, 'Ghost Curse stays at the status default'));
}

function offensive(facts: ScoreFacts, clauses: Clause[], stat: 'atk' | 'spa' | 'both'): boolean {
  hateSetup(facts, clauses);
  if (facts.playerHits <= 1) clauses.push(fixed(-20, 'Player KOs before setup pays off'));
  else if (facts.playerFastTwoHit) clauses.push(fixed(-5, 'Player fast 2HKOs'));
  if (facts.incapacitated) clauses.push(chance(0.9, 3, 'Setup while the player cannot move'));
  else if (facts.playerHits >= 4) clauses.push(fixed(facts.aiFirst ? 2 : 1, facts.aiFirst ? 'Setup with a slower target' : 'Setup with a faster target'));
  if (phazeThreat(facts) && !facts.aiLastMon) clauses.push(fixed(-5, 'Player can phaze'));
  if (statThreat(facts, stat)) clauses.push(fixed(-5, 'Setup feeds the player'));
  const stage = stat === 'both' ? Math.max(facts.ai.boosts.atk, facts.ai.boosts.spa) : facts.ai.boosts[stat];
  if (stage >= 2) clauses.push(chance(0.8, -1, 'Offensive stat is already +2'));
  return true;
}

function defensive(facts: ScoreFacts, clauses: Clause[], kind: 'def' | 'spd' | 'both'): boolean {
  hateSetup(facts, clauses);
  if (facts.playerHits <= 1) clauses.push(fixed(-20, 'Player KOs before setup pays off'));
  else if (facts.playerFastTwoHit) clauses.push(fixed(-5, 'Player fast 2HKOs'));
  if (phazeThreat(facts) && !facts.aiLastMon) clauses.push(fixed(-5, 'Player can phaze'));
  const inner: Clause[] = [];
  if (facts.incapacitated) inner.push(chance(0.9, 2, 'Defensive setup into an incapacitated target'));
  if (kind === 'def' || kind === 'both') {
    if (facts.playerPhysical && !facts.playerSpecial) inner.push(fixed(1, 'Target is physical'));
    if (facts.ai.boosts.def >= 2 && !hasMove(facts.ai, 'Body Press')) inner.push(fixed(-1, 'Defense is already +2'));
  }
  if (kind === 'spd' || kind === 'both') {
    if (facts.playerSpecial && !facts.playerPhysical) inner.push(fixed(1, 'Target is special'));
    if (facts.ai.boosts.spd >= 2 && !hasMove(facts.ai, 'Stored Power')) inner.push(fixed(-1, 'Special Defense is already +2'));
  }
  if (kind === 'both') {
    if (facts.ai.boosts.def < 1 || facts.ai.boosts.spd < 1) inner.push(fixed(2, 'A mixed defense stat is still low'));
    if (hasMove(facts.ai, 'Stored Power', 'Body Press')) inner.push(chance(0.5, 1, 'Body Press or Stored Power'));
  }
  if (facts.move === 'Defense Curl' && hasMove(facts.ai, 'Rollout', 'Ice Ball') && !facts.ai.defenseCurl) {
    inner.push(fixed(1, 'Defense Curl powers Rollout'));
  }
  if (facts.move === 'Stockpile' && hasMove(facts.ai, 'Spit Up', 'Swallow')) inner.push(fixed(1, 'Stockpile fuels Spit Up or Swallow'));
  if (inner.length) clauses.push(gate(0.8, inner, 'Defensive setup bonuses'));
  return true;
}

function mixed(facts: ScoreFacts, clauses: Clause[]): boolean {
  const physicalMove = PHYSICAL_MIXED.has(facts.move) || facts.move === 'No Retreat' || (facts.move === 'Superpower' && facts.ai.ability === 'Contrary');
  const defensiveMode = physicalMove
    ? facts.playerPhysical && !facts.playerSpecial
    : facts.playerSpecial && !facts.playerPhysical;
  if (defensiveMode) defensive(facts, clauses, physicalMove ? 'def' : 'spd');
  else offensive(facts, clauses, physicalMove ? 'atk' : 'spa');
  return true;
}

function speedSetup(facts: ScoreFacts, clauses: Clause[]): boolean {
  if (hasAny(facts.player, SETUP_HATE_MOVES) || hasAny(facts.player, PHAZING_MOVES) || facts.player.ability === 'Unaware') {
    clauses.push(fixed(-20, 'Speed boost would be removed'));
  }
  if (facts.aiFirst) clauses.push(fixed(-20, 'Already faster'));
  else clauses.push(chance(0.8, 1, 'Speed setup while slower'));
  if (facts.move === 'Rapid Spin') {
    if (facts.ai.leechSeeded || facts.ai.wrapped) clauses.push(fixed(1, 'Rapid Spin breaks a trap'));
    if (facts.aiSide.stealthRock || facts.aiSide.spikes || facts.aiSide.toxicSpikes || facts.aiSide.stickyWeb) {
      clauses.push(chance(0.5, 2, 'Rapid Spin clears hazards'));
    }
  }
  return true;
}

function evasion(facts: ScoreFacts, clauses: Clause[]): boolean {
  if (hasAny(facts.player, SETUP_HATE_MOVES) || hasAny(facts.player, PHAZING_MOVES) || facts.player.ability === 'Unaware') {
    clauses.push(fixed(-20, 'Evasion would be removed'));
  }
  const ratio = facts.ai.curHp / Math.max(1, facts.aiMaxHp);
  if (ratio > 0.9) clauses.push(chance(0.8, 1, 'Evasion above 90% HP'));
  else if (ratio > 0.6) clauses.push(chance(0.6, 1, 'Evasion above 60% HP'));
  return true;
}

function chargeMove(facts: ScoreFacts, clauses: Clause[]): boolean {
  const immediate = facts.ai.item === 'Power Herb' || facts.ai.charging;
  if (!immediate) {
    clauses.push(fixed(-20, 'Charge move is not immediate'));
    return true;
  }
  if (facts.move === 'Geomancy') {
    if (facts.playerCanFaint) clauses.push(fixed(-20, 'Player KOs through Geomancy'));
    else if (hasAny(facts.player, SETUP_HATE_MOVES) || hasAny(facts.player, PHAZING_MOVES) || facts.player.ability === 'Unaware') {
      clauses.push(fixed(-20, 'Geomancy would be removed'));
    } else clauses.push(chance(0.8, 9, 'Immediate Geomancy'));
  } else if (facts.move === 'Sky Attack' || facts.move === 'Freeze Shock' || facts.move === 'Ice Burn') {
    clauses.push(chance(0.8, 9, 'Immediate two-turn attack'));
  } else clauses.push(fixed(9, 'Immediate charge move'));
  return true;
}

function sleep(facts: ScoreFacts, clauses: Clause[]): boolean {
  if (facts.aiMaxKills) return true;
  const inner: Clause[] = [fixed(1, 'Sleep is available')];
  if (hasMove(facts.ai, 'Dream Eater', 'Nightmare', 'Snore', 'Sleep Talk')) inner.push(fixed(1, 'AI has a sleep payoff'));
  if (hasMove(facts.ai, 'Hex', 'Infernal Parade')) inner.push(fixed(1, 'AI has Hex or Infernal Parade'));
  clauses.push(gate(0.25, inner, 'Sleep roll'));
  return true;
}

function poison(facts: ScoreFacts, clauses: Clause[]): boolean {
  if (facts.aiMaxKills) return true;
  const inner: Clause[] = [];
  if (!facts.playerPhysical && !facts.playerSpecial) inner.push(fixed(1, 'Target has no attacks'));
  if (hasMove(facts.ai, 'Protect', 'Venoshock', 'Hex', 'Infernal Parade', 'Venom Drench') || facts.ai.ability === 'Merciless') {
    inner.push(fixed(1, 'AI has a poison payoff'));
  }
  if (inner.length) clauses.push(gate(0.2, inner, 'Poison roll'));
  return true;
}

function paralysis(facts: ScoreFacts, clauses: Clause[]): boolean {
  if (facts.aiMaxKills) return true;
  if (facts.paraFlipsSpeed) clauses.push(fixed(2, 'Paralysis flips a speed deficit'));
  else if (hasMove(facts.ai, 'Hex', 'Infernal Parade') || flinchMove(facts.ai)) clauses.push(fixed(2, 'Paralysis plus a flinch or Hex move'));
  else if (facts.player.confused || facts.player.infatuated) clauses.push(fixed(2, 'Paralysis stacks with another status'));
  else clauses.push(fixed(1, 'Paralysis chip'));
  return true;
}

function burn(facts: ScoreFacts, clauses: Clause[], frost: boolean): boolean {
  if (facts.aiMaxKills) return true;
  const inner: Clause[] = [fixed(1, frost ? 'Frostbite' : 'Burn')];
  if (frost ? facts.playerSpecial : facts.playerPhysical) inner.push(fixed(1, 'Burn or frostbite hits the attacking stat'));
  else if (hasMove(facts.ai, 'Hex', 'Infernal Parade')) inner.push(fixed(1, 'Hex or Infernal Parade'));
  clauses.push(gate(1 / 3, inner, 'Burn roll'));
  return true;
}

function confusion(facts: ScoreFacts, clauses: Clause[]): boolean {
  if (!facts.aiMaxKills) {
    const inner: Clause[] = [fixed(1, 'Confusion')];
    if (facts.player.status === 'par' || facts.player.infatuated || (facts.ai.ability === 'Serene Grace' && flinchMove(facts.ai))) {
      inner.push(fixed(1, 'Confusion stacks'));
    }
    clauses.push(gate(0.25, inner, 'Confusion roll'));
  }
  if (facts.move === 'Swagger' || facts.move === 'Flatter') {
    if (hasMove(facts.ai, 'Psych Up', 'Spectral Thief') || facts.ai.item === 'Mirror Herb' || (facts.move === 'Swagger' && hasMove(facts.ai, 'Foul Play'))) {
      clauses.push(fixed(1, 'AI can copy or punish the boost'));
    }
  }
  return true;
}

function speedDrop(facts: ScoreFacts, clauses: Clause[]): boolean {
  if (!facts.aiFirst && facts.category === 'Status') clauses.push(fixed(1, 'Speed drop while slower'));
  if (facts.aiFirst) clauses.push(fixed(-2, 'Speed drop while already faster'));
  return true;
}

function statDrop(facts: ScoreFacts, clauses: Clause[], stat: 'atk' | 'def' | 'spa' | 'spd'): boolean {
  const stage = stat === 'atk' || stat === 'def' || stat === 'spa' || stat === 'spd' ? facts.player.boosts[stat] : 0;
  if (stage <= -1) clauses.push(chance(0.8, -2, 'Stat is already lowered'));
  else clauses.push(chance(0.2, 1, 'Stat drop'));
  if ((stat === 'atk' && !facts.playerPhysical) || (stat === 'spa' && !facts.playerSpecial)) {
    clauses.push(fixed(-2, 'Target does not use that attacking stat'));
  }
  return true;
}

function accuracyDrop(facts: ScoreFacts, clauses: Clause[]): boolean {
  if (facts.player.boosts.accuracy <= -2) clauses.push(chance(0.8, -2, 'Accuracy is already -2'));
  const ratio = facts.ai.curHp / Math.max(1, facts.aiMaxHp);
  if (ratio > 0.9) clauses.push(chance(0.8, 2, 'Accuracy drop above 90% HP'));
  else if (ratio > 0.6) clauses.push(chance(0.8, 1, 'Accuracy drop above 60% HP'));
  else clauses.push(fixed(-1, 'Accuracy drop below 60% HP'));
  return true;
}

function hazards(facts: ScoreFacts, clauses: Clause[]): boolean {
  if (facts.playerLastMon) clauses.push(fixed(-10, 'Player is on their last Pokémon'));
  const spikes = facts.move === 'Spikes' || facts.move === 'Ceaseless Edge' || facts.move === 'Toxic Spikes';
  if (facts.ai.turnsActive === 0 && !facts.aiLastMon && facts.move !== 'Sticky Web') clauses.push(chance(0.98, 2, 'Hazards on the first turn'));
  clauses.push(chance(0.45, 1, 'Hazard pressure'));
  if (spikes && ((facts.move === 'Toxic Spikes' && facts.playerSide.toxicSpikes >= 1) || facts.playerSide.spikes >= 1)) {
    clauses.push(chance(0.98, -1, 'A layer is already up'));
  }
  return true;
}

function sticky(facts: ScoreFacts, clauses: Clause[]): boolean {
  if (facts.playerLastMon) clauses.push(fixed(-10, 'Player is on their last Pokémon'));
  if (facts.ai.turnsActive === 0) clauses.push(fixed(3, 'Sticky Web on the first turn'));
  clauses.push(chance(0.5, 1, 'Sticky Web pressure'));
  return true;
}

function tailwind(facts: ScoreFacts, clauses: Clause[]): boolean {
  if (hasMove(facts.player, 'Trick Room', 'Taunt')) clauses.push(chance(0.5, -1, 'Player can answer Tailwind'));
  if (!facts.aiFirst) clauses.push(fixed(3, 'Tailwind while slower'));
  return true;
}

function trickRoom(facts: ScoreFacts, clauses: Clause[]): boolean {
  if (hasMove(facts.player, 'Trick Room', 'Taunt')) clauses.push(chance(0.5, -1, 'Player can answer Trick Room'));
  if (!facts.aiFirst) clauses.push(fixed(4, 'Trick Room while slower'));
  else clauses.push(fixed(-1, 'Trick Room while faster'));
  return true;
}

function explosion(facts: ScoreFacts, clauses: Clause[]): boolean {
  const ratio = facts.ai.curHp / Math.max(1, facts.aiMaxHp);
  if (ratio < 0.1) clauses.push(fixed(10, 'Explosion below 10%'));
  else if (ratio < 0.33) clauses.push(pick('Explosion below 33%', [{ p: 0.7, delta: 8 }, { p: 0.3, delta: 0 }]));
  else if (ratio < 0.66) clauses.push(pick('Explosion below 66%', [{ p: 0.5, delta: 7 }, { p: 0.5, delta: 0 }]));
  else clauses.push(pick('Explosion at high HP', [{ p: 0.05, delta: 7 }, { p: 0.95, delta: 0 }]));
  if (facts.aiLastMon) clauses.push(fixed(facts.playerLastMon ? -1 : -10, 'Last Pokémon explosion'));
  if (facts.move === 'Memento' && facts.player.boosts.atk <= -6 && facts.player.boosts.spa <= -6) {
    clauses.push(fixed(-20, 'Memento cannot drop stats'));
  }
  return true;
}

function finalGambit(facts: ScoreFacts, clauses: Clause[]): boolean {
  if (facts.aiFirst && facts.ai.curHp >= facts.player.curHp) clauses.push(fixed(8, 'Final Gambit wins the HP race'));
  else if (facts.aiFirst && facts.playerCanFaint) clauses.push(fixed(7, 'Final Gambit while faster and dying'));
  else clauses.push(fixed(6, 'Final Gambit'));
  if (facts.aiLastMon) clauses.push(fixed(facts.playerLastMon ? -1 : -10, 'Last Pokémon Final Gambit'));
  return true;
}

function baton(facts: ScoreFacts, clauses: Clause[]): boolean {
  if (phazeThreat(facts) && !positiveBoost(facts.ai)) clauses.push(fixed(-20, 'Baton Pass has nothing and can be phazed'));
  clauses.push(chance(0.25, -1, 'Baton Pass hesitation'));
  if (positiveBoost(facts.ai) || facts.ai.substitute) clauses.push(fixed(1, 'Baton Pass has something to give'));
  return true;
}

function pivot(facts: ScoreFacts, clauses: Clause[]): boolean {
  if (facts.ai.species.startsWith('Palafin')) {
    clauses.push(fixed(12, 'Palafin pivot'));
    return true;
  }
  if (facts.move !== 'Parting Shot' && facts.moveHits > 3) clauses.push(fixed(6, 'Pivot while the target lives a while'));
  if (phazeThreat(facts)) clauses.push(fixed(-1, 'Player can phaze the switch-in'));
  return true;
}

function knockOff(facts: ScoreFacts, clauses: Clause[]): boolean {
  if (facts.moveHits > 3 && facts.player.item && !facts.player.item.endsWith('ite')) clauses.push(fixed(6, 'Knock Off into a long fight'));
  return true;
}

function screens(facts: ScoreFacts, clauses: Clause[]): boolean {
  const wrong = (facts.move === 'Reflect' && !facts.playerPhysical) || (facts.move === 'Light Screen' && !facts.playerSpecial);
  const veilOk = facts.move === 'Aurora Veil' && (facts.field.weather === 'Snow' || facts.field.weather === 'Hail');
  if (facts.move === 'Aurora Veil' && !veilOk) return true;
  if (wrong) return true;
  clauses.push(chance(0.5, 1, 'Screen'));
  if (facts.ai.item === 'Light Clay') clauses.push(fixed(1, 'Light Clay'));
  return true;
}

function secretPower(facts: ScoreFacts, clauses: Clause[]): boolean {
  if (facts.field.terrain === 'Grassy') clauses.push(chance(0.25, 6, 'Secret Power in Grassy Terrain'));
  return true;
}

function ohko(facts: ScoreFacts, clauses: Clause[]): boolean {
  if (facts.moveHits >= 3) clauses.push(fixed(6, 'OHKO move into a bulky target'));
  else clauses.push(fixed(5, 'OHKO move'));
  if (facts.ai.lockOn) clauses.push(fixed(8, 'Lock-On'));
  if (facts.player.item === 'Focus Band' || facts.player.item === 'Focus Sash' || facts.player.ability === 'Sturdy') {
    clauses.push(fixed(-20, 'OHKO is blocked'));
  }
  return true;
}

function binding(facts: ScoreFacts, clauses: Clause[]): boolean {
  if (facts.playerTypes.includes('Ghost') || facts.player.item === 'Shed Shell') {
    clauses.push(fixed(-20, 'Binding does not stick'));
    return true;
  }
  clauses.push(pick('Binding damage', [{ p: 0.8, delta: 6 }, { p: 0.2, delta: 8 }]));
  if (facts.ai.item === 'Binding Band' || facts.ai.item === 'Grip Claw') clauses.push(fixed(1, 'Binding item'));
  return true;
}

function saltCure(facts: ScoreFacts, clauses: Clause[]): boolean {
  clauses.push(pick('Salt Cure', [{ p: 0.8, delta: 6 }, { p: 0.2, delta: 7 }]));
  if (facts.playerTypes.includes('Water') || facts.playerTypes.includes('Steel')) clauses.push(fixed(1, 'Salt Cure into Water or Steel'));
  return true;
}

function trapping(facts: ScoreFacts, clauses: Clause[]): boolean {
  if (!facts.playerTypes.includes('Ghost') && facts.player.item !== 'Shed Shell') clauses.push(fixed(6, 'Trapping'));
  return true;
}

function recovery(facts: ScoreFacts, clauses: Clause[]): boolean {
  if (facts.move === 'Pain Split') {
    const gained = (facts.player.curHp - facts.ai.curHp) / 2;
    if (gained <= 0.3 * facts.aiMaxHp) {
      clauses.push(fixed(-1, 'Pain Split heals too little'));
      return true;
    }
  }
  const p = shouldRecoverChance(facts);
  if (p >= 0.999) clauses.push(fixed(1, 'Recovery is worth it'));
  else if (p <= 0.001) clauses.push(fixed(-1, 'Recovery is not worth it'));
  else clauses.push(pick('Recovery roll', [{ p, delta: 1 }, { p: 1 - p, delta: -1 }]));
  return true;
}

function drain(facts: ScoreFacts, clauses: Clause[]): boolean {
  if (facts.player.ability === 'Liquid Ooze') return true;
  if (facts.ai.curHp <= facts.aiMaxHp / 2 && facts.moveHits <= 4) clauses.push(fixed(6, 'Drain move at half HP'));
  if (facts.ai.item === 'Big Root') clauses.push(fixed(1, 'Big Root'));
  return true;
}

function copyMove(facts: ScoreFacts, clauses: Clause[]): boolean {
  if (!facts.player.lastMove) clauses.push(fixed(0, 'Copied move is not known yet'));
  else clauses.push(fixed(0, `Copies ${facts.player.lastMove}`));
  return true;
}

function roar(facts: ScoreFacts, clauses: Clause[]): boolean {
  if (facts.playerSide.spikes >= 3) clauses.push(fixed(1, 'Three layers of Spikes'));
  else if (facts.playerSide.spikes === 2) clauses.push(chance(0.75, 1, 'Two layers of Spikes'));
  else if (facts.playerSide.spikes === 1) clauses.push(chance(0.5, 1, 'One layer of Spikes'));
  if (facts.playerSide.stealthRock) clauses.push(chance(0.5, 1, 'Stealth Rock is up'));
  clauses.push(chance(0.5, -1, 'Phaze hesitation'));
  return true;
}

function phazeContact(facts: ScoreFacts, clauses: Clause[]): boolean {
  if (facts.player.perishCount !== null) clauses.push(fixed(-20, 'Do not phaze a Perish Song target'));
  if (facts.playerCanFaint) clauses.push(fixed(-20, 'Player KOs the phazer'));
  return true;
}

function conversion2(facts: ScoreFacts, clauses: Clause[]): boolean {
  if (facts.playerCanFaint) clauses.push(fixed(1, 'Conversion 2 into a KO'));
  return true;
}

function laser(facts: ScoreFacts, clauses: Clause[]): boolean {
  if (facts.ai.ability === 'Sniper') clauses.push(fixed(1, 'Sniper'));
  if (facts.player.ability === 'Battle Armor' || facts.player.ability === 'Shell Armor') clauses.push(fixed(-20, 'Target cannot be crit'));
  return true;
}

function focusEnergy(facts: ScoreFacts, clauses: Clause[]): boolean {
  if (['Sniper', 'Super Luck'].includes(facts.ai.ability) || facts.ai.item === 'Scope Lens') clauses.push(fixed(1, 'Crit payoff'));
  if (facts.player.ability === 'Battle Armor' || facts.player.ability === 'Shell Armor') clauses.push(fixed(-20, 'Target cannot be crit'));
  return true;
}

function shedTail(facts: ScoreFacts, clauses: Clause[]): boolean {
  if (facts.player.ability === 'Infiltrator') clauses.push(fixed(-20, 'Infiltrator ignores the substitute'));
  if (facts.playerCanFaint && facts.aiFirst) clauses.push(chance(0.5, 1, 'Shed Tail while faster and dying'));
  else clauses.push(chance(0.25, 1, 'Shed Tail'));
  return true;
}

function substitute(facts: ScoreFacts, clauses: Clause[]): boolean {
  if (facts.player.ability === 'Infiltrator') clauses.push(fixed(-20, 'Infiltrator ignores Substitute'));
  if (facts.player.perishCount !== null) clauses.push(fixed(1, 'Substitute into Perish Song'));
  if (facts.player.status === 'brn' || facts.player.status === 'psn' || facts.player.status === 'tox' || facts.player.status === 'frb') {
    clauses.push(chance(0.25, 1, 'Substitute into residual damage'));
  }
  if (facts.player.wrapped) clauses.push(chance(0.25, 1, 'Substitute into a bind'));
  if (facts.ai.ability === 'Speed Boost') clauses.push(chance(0.25, 1, 'Speed Boost behind a Substitute'));
  clauses.push(chance(0.5, -1, 'Substitute hesitation'));
  return true;
}

function leech(facts: ScoreFacts, clauses: Clause[]): boolean {
  if (!hasMove(facts.player, 'Rapid Spin') && facts.player.ability !== 'Magic Guard') clauses.push(chance(0.5, 1, 'Leech Seed sticks'));
  if (facts.moveHits > 3) clauses.push(chance(0.5, 1, 'Leech Seed into a long fight'));
  return true;
}

function teleport(facts: ScoreFacts, clauses: Clause[]): boolean {
  if (facts.aiFirst && facts.playerCanFaint) clauses.push(fixed(-20, 'Teleport is too slow to escape'));
  if (facts.moveHits > 3) clauses.push(chance(0.5, 1, 'Pivot while the target lives'));
  return true;
}

function disable(facts: ScoreFacts, clauses: Clause[]): boolean {
  if (facts.aiFirst && facts.playerCanFaint && facts.player.lastMove) clauses.push(fixed(1, 'Disable the move that KOs'));
  return true;
}

function encore(facts: ScoreFacts, clauses: Clause[]): boolean {
  const last = facts.player.lastMove;
  const encourage = last && (PROTECT_MOVES.has(last) || ['Fake Out', 'First Impression'].includes(last) || last === 'Stealth Rock' || last === 'Swords Dance');
  if (facts.aiFirst && encourage) clauses.push(fixed(1, 'Encore a weak last move'));
  return true;
}

function sleepTalk(facts: ScoreFacts, clauses: Clause[]): boolean {
  if (facts.ai.status === 'slp' && facts.ai.ability !== 'Comatose') clauses.push(fixed(15, 'Sleep Talk while asleep'));
  if (facts.move === 'Snore' && facts.ai.status === 'slp') clauses.push(fixed(15, 'Snore while asleep'));
  return true;
}

function destinyBond(facts: ScoreFacts, clauses: Clause[]): boolean {
  if (facts.ai.item === 'Focus Sash' || facts.ai.disguiseIntact) clauses.push(fixed(-20, 'Sash or Disguise makes Destiny Bond worse'));
  if (facts.aiFirst && facts.playerCanFaint) clauses.push(chance(0.815, 1, 'Destiny Bond while faster and dying'));
  else if (!facts.aiFirst) clauses.push(chance(0.5, -1, 'Destiny Bond while slower'));
  return true;
}

function wish(facts: ScoreFacts, clauses: Clause[]): boolean {
  if (facts.allyLowHp || facts.ai.curHp < facts.aiMaxHp * 0.65) clauses.push(fixed(1, 'Wish into low HP'));
  return true;
}

function healBell(facts: ScoreFacts, clauses: Clause[]): boolean {
  if (facts.partyStatus || facts.ai.status) clauses.push(fixed(1, 'A party member is statused'));
  return true;
}

function nightmare(facts: ScoreFacts, clauses: Clause[]): boolean {
  if (facts.player.status === 'slp') clauses.push(fixed(1, 'Nightmare into sleep'));
  if (facts.player.trapped) clauses.push(fixed(1, 'Nightmare into a trap'));
  return true;
}

function perish(facts: ScoreFacts, clauses: Clause[]): boolean {
  if (facts.player.trapped) clauses.push(fixed(2, 'Perish Song into a trap'));
  return true;
}

function weather(facts: ScoreFacts, clauses: Clause[]): boolean {
  clauses.push(fixed(2, 'Weather or terrain'));
  if (['Heat Rock', 'Damp Rock', 'Smooth Rock', 'Icy Rock', 'Terrain Extender'].includes(facts.ai.item)) {
    clauses.push(chance(0.8, 1, 'Extending item'));
  }
  return true;
}

function attract(facts: ScoreFacts, clauses: Clause[]): boolean {
  if (facts.player.status || facts.player.trapped) clauses.push(fixed(1, 'Attract into a status or trap'));
  return true;
}

function taunt(facts: ScoreFacts, clauses: Clause[]): boolean {
  const statusMove = facts.player.moves.some((name) => PROTECT_MOVES.has(name) || SLEEP.has(name) || ['Swords Dance', 'Nasty Plot', 'Recover', 'Will-O-Wisp', 'Thunder Wave', 'Toxic', 'Stealth Rock', 'Spikes', 'Tailwind'].includes(name));
  if (statusMove) clauses.push(chance(0.5, 1, 'Taunt a status move'));
  else clauses.push(chance(0.5, -1, 'Taunt into only attacks'));
  return true;
}

function rollout(facts: ScoreFacts, clauses: Clause[]): boolean {
  clauses.push(pick('Rollout', [{ p: 0.5, delta: 6 }, { p: 0.5, delta: 7 }]));
  if (facts.ai.defenseCurl) clauses.push(fixed(1, 'Defense Curl is up'));
  return true;
}

function fury(facts: ScoreFacts, clauses: Clause[]): boolean {
  clauses.push(fixed(6, 'Ramping move'));
  if (facts.ai.lastMove === facts.move) clauses.push(fixed(2, 'Ramping move was used last turn'));
  return true;
}

function protect(facts: ScoreFacts, clauses: Clause[]): boolean {
  if (facts.incapacitated) clauses.push(fixed(-20, 'Protect into a Pokémon that cannot move'));
  if (facts.ai.perishCount === 1) clauses.push(fixed(-10, 'About to faint anyway'));
  if (facts.ai.usedProtectLastTurn) clauses.push(chance(0.5, -10, 'Protect was used last turn'));
  if (facts.ai.protectStreak >= 2) clauses.push(fixed(-10, 'Protect succeeded twice'));
  if (facts.move === "King's Shield") {
    if (!facts.aiFirst && facts.playerCanFaint) clauses.push(chance(0.8, 10, "King's Shield into a faster KO"));
    if (facts.playerPhysical) clauses.push(chance(0.75, 1, "King's Shield into a physical attacker"));
    else clauses.push(chance(0.375, 1, "King's Shield"));
  }
  if ((facts.ai.ability === 'Power Construct' || facts.ai.ability === 'Zen Mode') && facts.ai.species.includes('50')) {
    clauses.push(chance(0.8, 8, 'Protect to reach the form change'));
  }
  return true;
}

function endure(facts: ScoreFacts, clauses: Clause[]): boolean {
  if (facts.ai.usedProtectLastTurn) clauses.push(chance(0.5, -10, 'Protection was used last turn'));
  if (facts.ai.protectStreak >= 2) clauses.push(fixed(-10, 'Protection succeeded twice'));
  if (facts.playerCanFaint) {
    if (['Liechi Berry', 'Petaya Berry', 'Ganlon Berry', 'Salac Berry', 'Apicot Berry', 'Lansat Berry', 'Starf Berry', 'Micle Berry'].includes(facts.ai.item) || hasMove(facts.ai, 'Flail', 'Reversal', 'Endeavor', 'Rage Fist')) {
      clauses.push(fixed(2, 'Endure into a pinch move or berry'));
    } else if (facts.ai.ability === 'Speed Boost') clauses.push(fixed(hasMove(facts.ai, 'Baton Pass') ? 2 : 1, 'Endure with Speed Boost'));
    else clauses.push(chance(0.5, -1, 'Endure hesitation'));
  } else clauses.push(chance(0.5, -1, 'Endure is unnecessary'));
  return true;
}

function fakeOut(facts: ScoreFacts, clauses: Clause[]): boolean {
  clauses.push(fixed(9, 'Fake Out'));
  if (!facts.kills && (facts.player.ability === 'Inner Focus' || facts.player.ability === 'Shield Dust' || facts.player.item === 'Covert Cloak')) {
    clauses.push(fixed(-30, 'Target cannot flinch and Fake Out does not KO'));
  }
  return true;
}

function feint(facts: ScoreFacts, clauses: Clause[]): boolean {
  if (facts.kills) clauses.push(chance(0.1, 6, 'Feint KOs'));
  return true;
}

function upperHand(facts: ScoreFacts, clauses: Clause[]): boolean {
  if (facts.player.moves.some((name) => name === 'Aqua Jet' || name === 'Mach Punch' || name === 'Extreme Speed' || name === 'Sucker Punch' || name === 'Ice Shard' || name === 'Quick Attack' || name === 'Bullet Punch' || name === 'Shadow Sneak' || name === 'Water Shuriken' || name === 'Jet Punch' || name === 'Thunderclap' || name === 'Upper Hand' || name === 'First Impression' || name === 'Accelerock' || name === 'Vacuum Wave' || name === 'Fake Out')) {
    clauses.push(chance(0.1, 13, 'Upper Hand into priority'));
  }
  return true;
}

function pursuit(facts: ScoreFacts, clauses: Clause[]): boolean {
  const negative = facts.ai.ability === 'Truant' || facts.ai.ability === 'Defeatist';
  const mummy = facts.player.ability === 'Mummy' || facts.player.ability === 'Wandering Spirit' || facts.player.ability === 'Lingering Aroma';
  if (negative && mummy) {
    clauses.push(fixed(12, 'Pursuit passes a negative ability'));
    return true;
  }
  if (facts.kills) clauses.push(fixed(11, 'Pursuit KOs'));
  else if (facts.player.curHp > 0) clauses.push(fixed(8, 'Pursuit pressure'));
  if (facts.aiFirst) clauses.push(fixed(3, 'Faster Pursuit'));
  return true;
}

function sucker(facts: ScoreFacts, clauses: Clause[]): boolean {
  if (facts.ai.lastMove === facts.move) clauses.push(chance(0.66, -20, 'Same priority attack was used last turn'));
  return true;
}

function imprison(facts: ScoreFacts, clauses: Clause[]): boolean {
  if (facts.player.moves.some((move) => facts.ai.moves.includes(move))) clauses.push(fixed(3, 'Imprison shares a move'));
  return true;
}

function wonderRoom(facts: ScoreFacts, clauses: Clause[]): boolean {
  clauses.push(chance(0.25, 2, 'Wonder Room'));
  return true;
}

function gravity(facts: ScoreFacts, clauses: Clause[]): boolean {
  clauses.push(gate(0.5, [pick('Gravity', [{ p: 0.75, delta: 4 }, { p: 0.25, delta: 5 }])], 'Gravity roll'));
  return true;
}

function relic(facts: ScoreFacts, clauses: Clause[]): boolean {
  if (facts.ai.species === 'Meloetta') clauses.push(fixed(10, 'Relic Song transforms Meloetta'));
  if (facts.ai.species === 'Meloetta-Pirouette') clauses.push(chance(0.25, 1, 'Relic Song on Pirouette'));
  return true;
}

function powder(facts: ScoreFacts, clauses: Clause[]): boolean {
  if (facts.player.moves.some((move) => move === 'Flamethrower' || move === 'Fire Blast' || move === 'Heat Wave' || move === 'Pyro Ball' || move === 'Flare Blitz' || move === 'Fire Punch' || move === 'Overheat' || move === 'Lava Plume')) {
    clauses.push(fixed(1, 'Powder into a Fire move'));
  } else clauses.push(fixed(-1, 'Powder without a Fire move'));
  return true;
}

function magnetRise(facts: ScoreFacts, clauses: Clause[]): boolean {
  if (facts.aiFirst && facts.player.moves.some((move) => move === 'Earthquake' || move === 'Earth Power' || move === 'High Horsepower' || move === 'Stomping Tantrum' || move === 'Bulldoze' || move === 'Drill Run')) {
    clauses.push(chance(0.9, 2, 'Magnet Rise into Ground'));
  } else clauses.push(fixed(-1, 'Magnet Rise is not needed'));
  return true;
}

function metronome(facts: ScoreFacts, clauses: Clause[]): boolean {
  if (facts.aiLastMon) clauses.push(fixed(-5, 'Metronome on the last third of the team'));
  return true;
}

function fling(facts: ScoreFacts, clauses: Clause[]): boolean {
  if (facts.ai.item === "King's Rock" && facts.aiFirst) clauses.push(fixed(9, "Fling King's Rock"));
  return true;
}

function topsy(facts: ScoreFacts, clauses: Clause[]): boolean {
  const positive = ['atk', 'def', 'spa', 'spd', 'spe'].filter((stat) => facts.player.boosts[stat as 'atk'] > 0).length;
  const negative = ['atk', 'def', 'spa', 'spd', 'spe'].filter((stat) => facts.player.boosts[stat as 'atk'] < 0).length;
  clauses.push(fixed(positive > negative ? 1 : -1, 'Topsy-Turvy'));
  return true;
}

function counter(facts: ScoreFacts, clauses: Clause[], category: 'Physical' | 'Special'): boolean {
  const matching = category === 'Physical' ? facts.playerPhysical && !facts.playerSpecial : facts.playerSpecial && !facts.playerPhysical;
  const sash = facts.ai.item === 'Focus Sash' || facts.ai.ability === 'Sturdy';
  if (matching && facts.playerCanFaint && sash) clauses.push(fixed(2, `${category} counter with a sash`));
  else if (matching) clauses.push(chance(0.8, 2, `${category} counter`));
  if (facts.aiFirst) clauses.push(chance(0.25, -1, 'Counter while faster'));
  return true;
}

function metalBurst(facts: ScoreFacts, clauses: Clause[]): boolean {
  if (facts.aiFirst) clauses.push(fixed(-20, 'Metal Burst while faster'));
  if (facts.ai.item === 'Focus Sash' || facts.ai.ability === 'Sturdy') clauses.push(fixed(2, 'Metal Burst with a sash'));
  clauses.push(chance(0.25, 1, 'Metal Burst'));
  return true;
}

function psychUp(facts: ScoreFacts, clauses: Clause[]): boolean {
  if (facts.player.boosts.atk > facts.ai.boosts.atk && facts.playerPhysical) clauses.push(fixed(1, 'Copy Attack'));
  if (facts.player.boosts.spa > facts.ai.boosts.spa && facts.playerSpecial) clauses.push(fixed(1, 'Copy Special Attack'));
  for (const stat of ['def', 'spd', 'spe'] as const) {
    if (facts.player.boosts[stat] > facts.ai.boosts[stat]) clauses.push(fixed(1, `Copy ${stat}`));
  }
  return true;
}

function recharge(facts: ScoreFacts, clauses: Clause[]): boolean {
  if (!facts.kills) clauses.push(fixed(-1, 'Recharge move does not KO'));
  return true;
}

function fellStinger(facts: ScoreFacts, clauses: Clause[]): boolean {
  if (facts.kills) clauses.push(fixed(facts.aiFirst || facts.priority > 0 ? 9 : 6, 'Fell Stinger KO'));
  return true;
}

function acupressure(facts: ScoreFacts, clauses: Clause[]): boolean {
  if (facts.playerCanFaint) clauses.push(fixed(-20, 'Player KOs through Acupressure'));
  else if (hasAny(facts.player, SETUP_HATE_MOVES) || hasAny(facts.player, PHAZING_MOVES) || facts.player.ability === 'Unaware') {
    clauses.push(fixed(-20, 'Acupressure would be removed'));
  } else if (facts.playerFastTwoHit) clauses.push(fixed(-5, 'Player fast 2HKOs'));
  else if (facts.incapacitated) clauses.push(chance(0.9, 3, 'Acupressure into an incapacitated target'));
  else if (facts.playerHits >= 4) clauses.push(fixed(facts.aiFirst ? 2 : 1, 'Acupressure'));
  return true;
}

function charge(facts: ScoreFacts, clauses: Clause[]): boolean {
  if (facts.playerCanFaint) clauses.push(fixed(-20, 'Player KOs through Charge'));
  if (phazeThreat(facts)) clauses.push(fixed(-20, 'Player can phaze Charge'));
  if (facts.ai.moves.some((name) => name === 'Thunderbolt' || name === 'Thunder' || name === 'Discharge' || name === 'Wild Charge' || name === 'Volt Switch' || name === 'Electroweb')) {
    clauses.push(fixed(1, 'Charge into an Electric move'));
  }
  return true;
}

function orderUp(facts: ScoreFacts, clauses: Clause[]): boolean {
  if (!facts.ai.commander) return true;
  if (facts.ai.commander === 'curly') offensive(facts, clauses, 'atk');
  else if (facts.ai.commander === 'droopy') defensive(facts, clauses, 'def');
  else speedSetup(facts, clauses);
  return true;
}

function followSecondary(facts: ScoreFacts, kind: string, clauses: Clause[]): void {
  if (kind === 'para') paralysis(facts, clauses);
  else if (kind === 'burn') burn(facts, clauses, false);
  else if (kind === 'frost') burn(facts, clauses, true);
  else if (kind === 'poison') poison(facts, clauses);
  else if (kind === 'confuse') confusion(facts, clauses);
  else if (kind === 'spe') speedDrop(facts, clauses);
  else if (kind === 'atk' || kind === 'def' || kind === 'spa' || kind === 'spd') statDrop(facts, clauses, kind);
}

function hateSetup(facts: ScoreFacts, clauses: Clause[]): void {
  if (facts.player.ability === 'Unaware' || hasAny(facts.player, SETUP_HATE_MOVES)) {
    clauses.push(fixed(-20, 'Player removes boosts'));
  }
}

function phazeThreat(facts: ScoreFacts): boolean {
  return hasAny(facts.player, PHAZING_MOVES);
}

function statThreat(facts: ScoreFacts, stat: 'atk' | 'spa' | 'both'): boolean {
  if ((stat === 'atk' || stat === 'both') && facts.aiFirst && (hasMove(facts.player, 'Burning Jealousy', 'Alluring Voice') || hasMove(facts.player, 'Foul Play') || confuseMove(facts.player))) return true;
  return false;
}

function positiveBoost(mon: { boosts: ScoreFacts['ai']['boosts'] }): boolean {
  return mon.boosts.atk > 0 || mon.boosts.def > 0 || mon.boosts.spa > 0 || mon.boosts.spd > 0 || mon.boosts.spe > 0;
}

function flinchMove(mon: { moves: string[] }): boolean {
  return mon.moves.some((move) => ['Air Slash', 'Iron Head', 'Rock Slide', 'Fake Out', 'Icicle Crash', 'Dark Pulse', 'Zen Headbutt', 'Waterfall'].includes(move));
}

function confuseMove(mon: { moves: string[] }): boolean {
  return mon.moves.some((move) => CONFUSE.has(move) || move === 'Dynamic Punch' || move === 'Hurricane');
}

function offensiveStat(move: string): 'atk' | 'spa' | 'both' {
  if (['Nasty Plot', 'Tail Glow', 'Mystical Power', 'Torch Song'].includes(move)) return 'spa';
  if (move === 'Growth' || move === 'Work Up') return 'both';
  return 'atk';
}

function defensiveKind(move: string): 'def' | 'spd' | 'both' {
  if (move === 'Amnesia') return 'spd';
  if (move === 'Cosmic Power' || move === 'Stockpile') return 'both';
  return 'def';
}

function isDrain(move: string): boolean {
  return DRAIN.has(move);
}

function isWeatherMove(move: string): boolean {
  return ['Sunny Day', 'Rain Dance', 'Sandstorm', 'Snowscape', 'Hail', 'Electric Terrain', 'Grassy Terrain', 'Psychic Terrain', 'Misty Terrain', 'Chilly Reception'].includes(move);
}

export function shouldRecoverChance(facts: ScoreFacts): number {
  if (facts.ai.status === 'tox' && facts.move !== 'Rest') return 0;
  const healFraction = facts.move === 'Rest' ? 1 : facts.move === 'Morning Sun' || facts.move === 'Synthesis' || facts.move === 'Moonlight' ? 0.67 : 0.5;
  const max = Math.max(1, facts.aiMaxHp);
  const heal = healFraction * max;
  const playerHit = facts.playerHits >= 99 ? 0 : max / facts.playerHits;
  if (playerHit >= heal) return 0;
  const ratio = facts.ai.curHp / max;
  if (facts.aiFirst) {
    const after = Math.min(max, facts.ai.curHp + heal);
    if (facts.playerCanFaint && playerHit >= facts.ai.curHp && playerHit < after) return 1;
    if (!facts.playerCanFaint && ratio < 0.4) return 1;
    if (!facts.playerCanFaint && ratio > 0.4 && ratio < 0.66) return 0.5;
    return 0;
  }
  if (ratio < 0.5) return 1;
  if (ratio < 0.7) return 0.75;
  return 0;
}
