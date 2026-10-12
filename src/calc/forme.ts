import { toID } from '@smogon/calc';
import type { PokemonState } from '../state/types';
import { gen, maxHpOf } from './damage';

/**
 * The Pokémon as it fights after Mega Evolution.
 * A Mega Stone or Rayquaza's Dragon Ascent changes the forme when that Mega exists in the damage data.
 * A species that is already Mega is left as entered.
 */
export function battleForme(mon: PokemonState): PokemonState {
  const forme = megaName(mon);
  if (!forme || forme === mon.species) return mon;
  const species = gen.species.get(toID(forme));
  if (!species) return mon;
  return { ...mon, species: forme, ability: species.abilities?.[0] || mon.ability };
}

function megaName(mon: PokemonState): string | undefined {
  if (mon.species.includes('-Mega')) return mon.species;
  if (mon.species === 'Rayquaza' && mon.moves.includes('Dragon Ascent')) return known('Rayquaza-Mega');
  const item = mon.item;
  if (!item || item === 'Eviolite' || !/ite(?: [XYZ])?$/.test(item)) return undefined;
  const suffix = item.endsWith(' X') ? '-Mega-X' : item.endsWith(' Y') ? '-Mega-Y' : item.endsWith(' Z') ? '-Mega-Z' : '-Mega';
  return known(`${mon.species}${suffix}`);
}

function known(name: string): string | undefined {
  return gen.species.get(toID(name)) ? name : undefined;
}

export function isMegaSpecies(species: string): boolean {
  return species.includes('-Mega');
}

export function baseOfMega(species: string): string {
  return species.replace(/-Mega(?:-[A-Z])?$/, '');
}

/** The forme this Pokémon is fighting as right now. A Mega Stone only changes it after Mega Evolution. */
export function actingForme(mon: PokemonState): PokemonState {
  if (!mon.megaEvolved && !isMegaSpecies(mon.species)) return mon;
  const forme = battleForme(mon);
  if (forme === mon) return mon;
  return { ...forme, curHp: Math.min(mon.curHp, maxHpOf(forme)) };
}

export function showsMegaToggle(party: PokemonState[], index: number): boolean {
  const mon = party[index];
  if (!mon) return false;
  if (isMegaSpecies(mon.species) || megaPartnerIndex(party, index) >= 0) return true;
  if (mon.species === 'Rayquaza' && mon.moves.includes('Dragon Ascent')) return true;
  return Boolean(mon.item && mon.item !== 'Eviolite' && /ite(?: [XYZ])?$/.test(mon.item));
}

/** The other listing of the same Mega pair, or -1 when this slot stands alone. */
export function megaPartnerIndex(party: PokemonState[], index: number): number {
  const mon = party[index];
  if (!mon) return -1;
  if (isMegaSpecies(mon.species)) {
    const base = baseOfMega(mon.species);
    return party.findIndex((other, otherIndex) => otherIndex !== index && other.species === base);
  }
  return party.findIndex((other, otherIndex) => otherIndex !== index && isMegaSpecies(other.species) && baseOfMega(other.species) === mon.species);
}

/**
 * Marks a Mega pair evolved or not.
 * The battle HP and status follow the listing that stays in play, and the active slot follows it too.
 */
export function applyMegaEvolved(party: PokemonState[], index: number, evolved: boolean, active: number): number {
  const mon = party[index];
  if (!mon) return active;
  const partner = megaPartnerIndex(party, index);
  const was = Boolean(mon.megaEvolved || (partner >= 0 && party[partner]!.megaEvolved));
  mon.megaEvolved = evolved;
  if (partner >= 0) party[partner]!.megaEvolved = evolved;
  if (partner < 0 || was === evolved) return active;
  const from = formeIndex(party, index, was);
  const to = formeIndex(party, index, evolved);
  if (from !== to) copyBattleCondition(party[from]!, party[to]!);
  return active === from ? to : active;
}

/** Marks this Pokémon KO'd. A Mega pair is one Pokémon, so both listings faint together. */
export function applyFainted(party: PokemonState[], index: number, fainted: boolean): void {
  const slots = [index];
  const partner = megaPartnerIndex(party, index);
  if (partner >= 0) slots.push(partner);
  for (const slot of slots) {
    const target = party[slot];
    if (!target) continue;
    target.fainted = fainted;
    if (fainted) target.curHp = 0;
    else if (target.curHp <= 0) target.curHp = maxHpOf(target);
  }
}

/**
 * Trainer sets list the Mega as its own party member. That slot is the same Pokémon
 * as the base forme, so it is not a switch-in until the pair has Mega Evolved.
 * Once it has, the base listing is the duplicate instead.
 */
export function unavailableForme(party: PokemonState[], index: number, active: number): boolean {
  if (index === active) return false;
  const mon = party[index];
  if (!mon) return false;
  const partner = megaPartnerIndex(party, index);
  if (partner < 0) return false;
  if (isMegaSpecies(mon.species)) return !pairEvolved(party, index, active);
  return pairEvolved(party, index, active);
}

function pairEvolved(party: PokemonState[], index: number, active: number): boolean {
  const mon = party[index]!;
  const partner = megaPartnerIndex(party, index);
  if (mon.megaEvolved || (partner >= 0 && party[partner]!.megaEvolved)) return true;
  const activeMon = party[active];
  if (!activeMon || !isMegaSpecies(activeMon.species)) return false;
  const base = isMegaSpecies(mon.species) ? baseOfMega(mon.species) : mon.species;
  return baseOfMega(activeMon.species) === base;
}

function formeIndex(party: PokemonState[], index: number, evolved: boolean): number {
  const partner = megaPartnerIndex(party, index);
  if (partner < 0) return index;
  const megaIndex = isMegaSpecies(party[index]!.species) ? index : partner;
  return evolved ? megaIndex : megaIndex === index ? partner : index;
}

function copyBattleCondition(from: PokemonState, to: PokemonState): void {
  to.curHp = from.curHp <= 0 ? 0 : Math.min(from.curHp, maxHpOf(to));
  to.status = from.status;
  to.boosts = { ...from.boosts };
  to.fainted = from.fainted;
  to.turnsActive = from.turnsActive;
  to.lastMove = from.lastMove;
  to.protectStreak = from.protectStreak;
  to.usedProtectLastTurn = from.usedProtectLastTurn;
  to.leechSeeded = from.leechSeeded;
  to.substitute = from.substitute;
  to.disguiseIntact = from.disguiseIntact;
  to.lockedMove = from.lockedMove;
  to.perishCount = from.perishCount;
  to.taunted = from.taunted;
  to.encored = from.encored;
  to.confused = from.confused;
  to.infatuated = from.infatuated;
  to.cursed = from.cursed;
  to.trapped = from.trapped;
  to.wrapped = from.wrapped;
  to.yawned = from.yawned;
  to.defenseCurl = from.defenseCurl;
  to.stockpile = from.stockpile;
  to.focusEnergy = from.focusEnergy;
  to.laserFocus = from.laserFocus;
  to.lockOn = from.lockOn;
  to.charging = from.charging;
  to.commander = from.commander;
  to.unburdenActive = from.unburdenActive;
  to.slowStart = from.slowStart;
  to.types = from.types?.slice();
}
