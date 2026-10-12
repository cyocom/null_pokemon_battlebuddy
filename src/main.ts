import { afterKo } from './advice/afterko';
import { rankReplies } from './advice/respond';
import { predictOpponent } from './ai/predict';
import { toID } from '@smogon/calc';
import { estimateDamage, gen, koChance, maxHpOf, speciesKnown } from './calc/damage';
import { actingForme, applyFainted, applyMegaEvolved, isMegaSpecies, megaPartnerIndex, showsMegaToggle, unavailableForme } from './calc/forme';
import { TRAINERS } from './data/trainers';
import { EmulatorSource, ManualSource } from './state/source';
import { blankSnapshot, partyFromTrainer } from './state/blank';
import { makePokemon } from './state/pokemon';
import { addBoxMonToParty, removeFromParty } from './state/roster';
import { parseShowdownPaste } from './state/showdown';
import type { BattleSnapshot, PokemonState, StatusName, WeatherName, TerrainName } from './state/types';

const snapshot = blankSnapshot();
const source = new ManualSource(snapshot);
let playerSelection: { list: 'box' | 'party'; index: number } | null = null;

const names = {
  species: [...gen.species].map((species) => species.name).sort((a, b) => a.localeCompare(b)),
  moves: [...gen.moves].map((move) => move.name).sort((a, b) => a.localeCompare(b)),
  abilities: [...gen.abilities].map((ability) => ability.name).sort((a, b) => a.localeCompare(b)),
  items: [...gen.items].map((item) => item.name).sort((a, b) => a.localeCompare(b)),
  natures: [...gen.natures].map((nature) => nature.name),
};

const POKEMON_TYPES = ['Normal', 'Fighting', 'Flying', 'Poison', 'Ground', 'Rock', 'Bug', 'Ghost', 'Steel', 'Fire', 'Water', 'Grass', 'Electric', 'Psychic', 'Ice', 'Dragon', 'Dark', 'Fairy'];

const app = document.querySelector('#app')!;
app.innerHTML = `
  <header>
    <div>
      <h1>Null battle advisor</h1>
      <p class="hint">Scores the opponent with Pokémon Null's AI, then ranks your reply by faint risk.</p>
    </div>
    <button id="emulator" type="button">Read from emulator</button>
  </header>
  <p id="error"></p>
  <div class="board">
    <section id="player-panel"></section>
    <section id="field-panel"></section>
    <section id="opponent-panel"></section>
  </div>
  <div class="results">
    <section>
      <h2>Opponent's likely action</h2>
      <p id="switch-note" class="hint"></p>
      <div id="opponent-actions"></div>
    </section>
    <section>
      <h2>Your best reply</h2>
      <div id="replies"></div>
    </section>
    <section id="after-ko">
      <h2>If you KO</h2>
      <p id="after-ko-note" class="hint"></p>
      <div id="after-ko-controls" class="row"></div>
      <div id="after-ko-table"></div>
    </section>
  </div>
`;

datalist('species-list', names.species);
datalist('move-list', names.moves);
datalist('ability-list', names.abilities);
datalist('item-list', names.items);
datalist('nature-list', names.natures);
datalist('trainer-list', TRAINERS.map((trainer) => trainer.name));

const playerPanel = document.querySelector('#player-panel') as HTMLElement;
const opponentPanel = document.querySelector('#opponent-panel') as HTMLElement;
const fieldPanel = document.querySelector('#field-panel') as HTMLElement;
buildPlayer(playerPanel);
buildSide(opponentPanel, 'opponent', 'Opponent');
buildField(fieldPanel);
buildAfterKo();
document.querySelector('#emulator')!.addEventListener('click', () => {
  const error = document.querySelector('#error')!;
  try {
    new EmulatorSource().read();
  } catch (err) {
    error.textContent = err instanceof Error ? err.message : String(err);
  }
});

refresh();

function buildPlayer(root: HTMLElement): void {
  root.innerHTML = `<h2>Your side</h2><p class="group-label">Party</p><div class="party" id="player-party"></div><p class="group-label">Box</p><div class="party" id="player-box"></div><div class="editor grid"></div>`;
  const editor = root.querySelector('.editor') as HTMLElement;
  appendPokemonFields(editor);
  const actions = document.createElement('div');
  actions.className = 'span-2 row';
  const add = document.createElement('button');
  add.type = 'button';
  add.textContent = 'Add to party';
  add.addEventListener('click', () => {
    const mon = editedPlayer();
    const note = document.querySelector('#box-note')!;
    if (!mon) {
      note.textContent = 'Select a Pokémon in your box first.';
      return;
    }
    const reason = addBoxMonToParty(snapshot.player, mon);
    if (reason) {
      note.textContent = reason;
      return;
    }
    if (snapshot.player.party.length === 1) snapshot.player.active = 0;
    note.textContent = `Added ${mon.species} to your party.`;
    drawPlayerLists();
    refresh();
  });
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.textContent = 'Remove from party';
  remove.addEventListener('click', () => {
    const mon = editedPlayer();
    const note = document.querySelector('#box-note')!;
    if (!mon || !snapshot.player.party.includes(mon)) {
      note.textContent = 'Select a party Pokémon to remove it.';
      return;
    }
    removeFromParty(snapshot.player, mon);
    const boxIndex = snapshot.player.box.indexOf(mon);
    playerSelection = boxIndex >= 0 ? { list: 'box', index: boxIndex } : null;
    note.textContent = `Removed ${mon.species} from your party.`;
    drawPlayerLists();
    refresh();
  });
  const importBox = document.createElement('button');
  importBox.type = 'button';
  importBox.textContent = 'Import box';
  importBox.addEventListener('click', () => void importPlayerBox(editor));
  actions.append(add, remove, importBox);
  const note = document.createElement('p');
  note.id = 'box-note';
  note.className = 'hint span-2';
  editor.append(actions, note);
  editor.addEventListener('change', () => syncPlayer(editor));
  editor.addEventListener('input', (event) => {
    const target = event.target as HTMLElement | null;
    if (target?.dataset.key === 'trainer') return;
    syncPlayer(editor);
  });
  drawPlayerLists();
}

function syncPlayer(editor: HTMLElement): void {
  const mon = editedPlayer();
  if (!mon) return;
  writeEditor(editor, mon);
  drawPlayerLists();
  refresh();
}

function editedPlayer(): PokemonState | undefined {
  if (!playerSelection) return undefined;
  const list = playerSelection.list === 'box' ? snapshot.player.box : snapshot.player.party;
  return list[playerSelection.index];
}

function drawPlayerLists(): void {
  const partyRoot = document.querySelector('#player-party') as HTMLElement;
  const boxRoot = document.querySelector('#player-box') as HTMLElement;
  const editor = document.querySelector('#player-panel .editor') as HTMLElement;
  partyRoot.replaceChildren();
  snapshot.player.party.forEach((mon, index) => {
    partyRoot.append(monButton(monLabel(mon), index === snapshot.player.active, false, () => {
      snapshot.player.active = index;
      playerSelection = { list: 'party', index };
      fillEditor(editor, mon);
      drawPlayerLists();
      refresh();
    }));
  });
  boxRoot.replaceChildren();
  snapshot.player.box.forEach((mon, index) => {
    const selected = playerSelection?.list === 'box'
      ? playerSelection.index === index
      : snapshot.player.party[playerSelection?.index ?? -1] === mon;
    boxRoot.append(monButton(monLabel(mon), selected, snapshot.player.party.includes(mon), () => {
      playerSelection = { list: 'box', index };
      fillEditor(editor, mon);
      drawPlayerLists();
    }));
  });
}

function monLabel(mon: PokemonState): string {
  const name = mon.species || 'Empty';
  return mon.types?.[0] ? `${name} (${mon.types[0]})` : name;
}

function speciesTyping(species: string): string {
  const data = gen.species.get(toID(species));
  return data?.types.join(' / ') || 'Species';
}

function labelSpeciesType(editor: HTMLElement, species: string): void {
  const option = editor.querySelector('[data-key="type"] option[value=""]');
  if (option) option.textContent = speciesTyping(species);
}

function monButton(species: string, active: boolean, inParty: boolean, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = species || 'Empty';
  if (active) button.classList.add('active');
  if (inParty) button.classList.add('in-party');
  button.addEventListener('click', onClick);
  return button;
}

function buildSide(root: HTMLElement, side: 'player' | 'opponent', title: string): void {
  root.innerHTML = `<h2>${title}</h2><div class="party"></div><div class="editor grid"></div>`;
  const editor = root.querySelector('.editor') as HTMLElement;
  const party = root.querySelector('.party') as HTMLElement;
  if (side === 'opponent') {
    const trainer = input('trainer', 'Trainer', snapshot.opponent.trainer, 'trainer-list');
    trainer.classList.add('span-2');
    editor.append(trainer);
    trainer.querySelector('input')!.addEventListener('change', () => {
      const name = (trainer.querySelector('input') as HTMLInputElement).value;
      const partyMons = partyFromTrainer(name);
      if (!partyMons.length) return;
      snapshot.opponent.trainer = name;
      snapshot.opponent.party = partyMons;
      snapshot.opponent.active = 0;
      fillEditor(editor, snapshot.opponent.party[0]!);
      drawParty(party, side);
      refresh();
    });
  }
  appendPokemonFields(editor);
  const actions = document.createElement('div');
  actions.className = 'span-2 row';
  const add = document.createElement('button');
  add.type = 'button';
  add.textContent = 'Add to party';
  add.addEventListener('click', () => {
    const created = makePokemon({ species: 'Magikarp', level: current(side)?.level || 50, moves: [] });
    created.curHp = maxHpOf(created);
    const partyList = partyOf(side);
    partyList.push(created);
    if (partyList.length === 1) {
      snapshot.opponent.active = 0;
      fillEditor(editor, created);
    }
    drawParty(party, side);
    refresh();
  });
  actions.append(add);
  editor.append(actions);
  const sync = () => {
    const mon = current(side);
    if (!mon) return;
    writeEditor(editor, mon);
    if (side === 'opponent') applyFainted(partyOf(side), activeIndex(side), mon.fainted || mon.curHp <= 0);
    drawParty(party, side);
    refresh();
  };
  editor.addEventListener('change', sync);
  editor.addEventListener('input', (event) => {
    const target = event.target as HTMLElement | null;
    if (target?.dataset.key === 'trainer') return;
    sync();
  });
  drawParty(party, side);
  const active = current(side);
  if (active) fillEditor(editor, active);
}

function appendPokemonFields(editor: HTMLElement): void {
  editor.append(
    input('species', 'Species', '', 'species-list'),
    num('level', 'Level', 1, 100),
    input('ability', 'Ability', '', 'ability-list'),
    select('type', 'Type', ['', ...POKEMON_TYPES], ['Species', ...POKEMON_TYPES]),
    input('item', 'Item', '', 'item-list'),
    input('nature', 'Nature', '', 'nature-list'),
    select('status', 'Status', ['', 'brn', 'par', 'psn', 'tox', 'slp', 'frz', 'frb'], ['Healthy', 'Burn', 'Paralysis', 'Poison', 'Toxic', 'Sleep', 'Freeze', 'Frostbite']),
    num('hp', 'Current HP', 1, 999),
    num('turns', 'Turns active', 0, 99),
    input('move0', 'Move 1', '', 'move-list'),
    input('move1', 'Move 2', '', 'move-list'),
    input('move2', 'Move 3', '', 'move-list'),
    input('move3', 'Move 4', '', 'move-list'),
    input('lastMove', 'Last move', '', 'move-list'),
    num('atk', 'Atk stage', -6, 6),
    num('def', 'Def stage', -6, 6),
    num('spa', 'SpA stage', -6, 6),
    num('spd', 'SpD stage', -6, 6),
    num('spe', 'Spe stage', -6, 6),
  );
}

async function importPlayerBox(editor: HTMLElement): Promise<void> {
  const error = document.querySelector('#error')!;
  const note = document.querySelector('#box-note')!;
  let text = '';
  try {
    text = await navigator.clipboard.readText();
  } catch {
    note.textContent = '';
    error.textContent = 'Could not read the clipboard. Allow clipboard access, then try again.';
    return;
  }
  const imported = parseShowdownPaste(text);
  if (!imported.length) {
    note.textContent = '';
    error.textContent = 'No Pokémon found. Copy a party in the Showdown export format, then try again.';
    return;
  }
  const start = snapshot.player.box.length;
  snapshot.player.box.push(...imported);
  playerSelection = { list: 'box', index: start };
  fillEditor(editor, imported[0]!);
  drawPlayerLists();
  note.textContent = `Added ${imported.length} Pokémon to your box.`;
}

function buildField(root: HTMLElement): void {
  root.innerHTML = '<h2>Field</h2>';
  const stack = document.createElement('div');
  stack.className = 'stack';
  stack.append(
    select('weather', 'Weather', ['', 'Sun', 'Rain', 'Sand', 'Snow', 'Hail', 'Harsh Sunshine', 'Heavy Rain', 'Strong Winds']),
    select('terrain', 'Terrain', ['', 'Electric', 'Grassy', 'Psychic', 'Misty']),
    check('trickRoom', 'Trick Room'),
    check('gravity', 'Gravity'),
    check('playerRocks', 'Rocks on you'),
    check('opponentRocks', 'Rocks on them'),
    num('playerSpikes', 'Your spikes', 0, 3),
    num('opponentSpikes', 'Their spikes', 0, 3),
    check('playerTailwind', 'Your Tailwind'),
    check('opponentTailwind', 'Their Tailwind'),
  );
  root.append(stack);
  const weather = stack.querySelector('[data-key="weather"]') as HTMLSelectElement;
  const terrain = stack.querySelector('[data-key="terrain"]') as HTMLSelectElement;
  const trick = stack.querySelector('[data-key="trickRoom"]') as HTMLInputElement;
  const gravity = stack.querySelector('[data-key="gravity"]') as HTMLInputElement;
  const playerRocks = stack.querySelector('[data-key="playerRocks"]') as HTMLInputElement;
  const opponentRocks = stack.querySelector('[data-key="opponentRocks"]') as HTMLInputElement;
  const playerSpikes = stack.querySelector('[data-key="playerSpikes"]') as HTMLInputElement;
  const opponentSpikes = stack.querySelector('[data-key="opponentSpikes"]') as HTMLInputElement;
  const playerTail = stack.querySelector('[data-key="playerTailwind"]') as HTMLInputElement;
  const opponentTail = stack.querySelector('[data-key="opponentTailwind"]') as HTMLInputElement;
  stack.addEventListener('change', () => {
    snapshot.field.weather = weather.value as WeatherName;
    snapshot.field.terrain = terrain.value as TerrainName;
    snapshot.field.trickRoom = trick.checked;
    snapshot.field.gravity = gravity.checked;
    snapshot.player.side.stealthRock = playerRocks.checked;
    snapshot.opponent.side.stealthRock = opponentRocks.checked;
    snapshot.player.side.spikes = Number(playerSpikes.value);
    snapshot.opponent.side.spikes = Number(opponentSpikes.value);
    snapshot.player.side.tailwind = playerTail.checked;
    snapshot.opponent.side.tailwind = opponentTail.checked;
    refresh();
  });
}

function drawParty(root: HTMLElement, side: 'player' | 'opponent'): void {
  root.replaceChildren();
  const party = partyOf(side);
  party.forEach((mon, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = monLabel(mon);
    if (index === activeIndex(side)) button.classList.add('active');
    if (mon.fainted || mon.curHp <= 0) button.classList.add('fainted');
    if (side === 'opponent' && unavailableForme(party, index, activeIndex(side))) {
      button.classList.add('held-forme');
      button.title = mon.megaEvolved
        ? 'Base forme of a Pokémon that has Mega Evolved.'
        : 'Listed Mega. Mark Mega once it has Mega Evolved.';
    }
    button.addEventListener('click', () => {
      if (side === 'player') snapshot.player.active = index;
      else selectOpponent(party, index);
      const editor = root.parentElement!.querySelector('.editor') as HTMLElement;
      fillEditor(editor, party[activeIndex(side)] ?? mon);
      drawParty(root, side);
      refresh();
    });
    if (side === 'player') {
      root.append(button);
      return;
    }
    const row = document.createElement('div');
    row.className = 'party-row';
    const flags = document.createElement('div');
    flags.className = 'party-flags';
    if (showsMegaToggle(party, index)) {
      flags.append(partyFlag('Mega', pairMegaEvolved(party, index), (checked) => {
        snapshot.opponent.active = applyMegaEvolved(party, index, checked, snapshot.opponent.active);
        const editor = root.parentElement!.querySelector('.editor') as HTMLElement;
        fillEditor(editor, party[snapshot.opponent.active]!);
        drawParty(root, side);
        refresh();
      }));
    }
    flags.append(partyFlag("KO'd", mon.fainted || mon.curHp <= 0, (checked) => {
      applyFainted(party, index, checked);
      const editor = root.parentElement!.querySelector('.editor') as HTMLElement;
      const active = snapshot.opponent.active;
      if (active === index || active === megaPartnerIndex(party, index)) fillEditor(editor, party[active]!);
      drawParty(root, side);
      refresh();
    }));
    row.append(button, flags);
    root.append(row);
  });
}

function selectOpponent(party: PokemonState[], index: number): void {
  const mon = party[index]!;
  if (isMegaSpecies(mon.species) && megaPartnerIndex(party, index) >= 0) {
    applyMegaEvolved(party, index, true, snapshot.opponent.active);
  }
  snapshot.opponent.active = index;
}

function pairMegaEvolved(party: PokemonState[], index: number): boolean {
  const mon = party[index]!;
  const partner = megaPartnerIndex(party, index);
  if (mon.megaEvolved || (partner >= 0 && party[partner]!.megaEvolved)) return true;
  const active = party[snapshot.opponent.active];
  return Boolean(active && isMegaSpecies(active.species) && partner >= 0 && (index === snapshot.opponent.active || partner === snapshot.opponent.active));
}

function partyFlag(label: string, checked: boolean, onChange: (checked: boolean) => void): HTMLLabelElement {
  const wrap = document.createElement('label');
  const field = document.createElement('input');
  field.type = 'checkbox';
  field.checked = checked;
  field.addEventListener('change', () => onChange(field.checked));
  wrap.append(field, document.createTextNode(label));
  return wrap;
}

function fillEditor(editor: HTMLElement, mon: PokemonState): void {
  set(editor, 'species', mon.species);
  set(editor, 'level', String(mon.level));
  set(editor, 'ability', mon.ability);
  labelSpeciesType(editor, mon.species);
  set(editor, 'type', mon.types?.[0] ?? '');
  set(editor, 'item', mon.item);
  set(editor, 'nature', mon.nature);
  set(editor, 'status', mon.status);
  set(editor, 'hp', String(mon.curHp));
  set(editor, 'turns', String(mon.turnsActive));
  for (let i = 0; i < 4; i++) set(editor, `move${i}`, mon.moves[i] ?? '');
  set(editor, 'lastMove', mon.lastMove);
  set(editor, 'atk', String(mon.boosts.atk));
  set(editor, 'def', String(mon.boosts.def));
  set(editor, 'spa', String(mon.boosts.spa));
  set(editor, 'spd', String(mon.boosts.spd));
  set(editor, 'spe', String(mon.boosts.spe));
}

function writeEditor(editor: HTMLElement, mon: PokemonState): void {
  const species = value(editor, 'species');
  const speciesChanged = species !== mon.species;
  mon.species = species;
  mon.level = numberValue(editor, 'level', mon.level);
  mon.ability = value(editor, 'ability');
  labelSpeciesType(editor, species);
  if (speciesChanged) {
    mon.types = undefined;
    set(editor, 'type', '');
    set(editor, 'lastMove', '');
  } else {
    const chosen = value(editor, 'type');
    mon.types = chosen ? [chosen] : undefined;
  }
  mon.item = value(editor, 'item');
  mon.nature = value(editor, 'nature') || 'Serious';
  mon.status = value(editor, 'status') as StatusName;
  mon.turnsActive = numberValue(editor, 'turns', 0);
  mon.moves = [0, 1, 2, 3].map((index) => value(editor, `move${index}`)).filter(Boolean);
  mon.lastMove = value(editor, 'lastMove');
  mon.boosts.atk = numberValue(editor, 'atk', 0);
  mon.boosts.def = numberValue(editor, 'def', 0);
  mon.boosts.spa = numberValue(editor, 'spa', 0);
  mon.boosts.spd = numberValue(editor, 'spd', 0);
  mon.boosts.spe = numberValue(editor, 'spe', 0);
  const typedHp = numberValue(editor, 'hp', mon.curHp);
  if (speciesKnown(mon.species)) {
    const max = maxHpOf(mon);
    mon.curHp = Math.min(max, speciesChanged ? max : typedHp);
  } else mon.curHp = typedHp;
  if (speciesChanged) set(editor, 'hp', String(mon.curHp));
  mon.fainted = mon.curHp <= 0;
}

function refresh(): void {
  const error = document.querySelector('#error')!;
  source.update(snapshot);
  try {
    const state = source.read();
    const prediction = predictOpponent(state);
    const replies = rankReplies(state, prediction.actions);
    renderActions(prediction.actions, prediction.switchReason, prediction.unspecified);
    renderReplies(replies);
    renderAfterKo(state);
    error.textContent = '';
  } catch (err) {
    error.textContent = err instanceof Error ? err.message : String(err);
  }
}

function renderActions(actions: { kind: string; label: string; probability: number; modalScore: number; damage: string; reasons: string[] }[], switchReason: string, unspecified: string[]): void {
  const note = document.querySelector('#switch-note')!;
  note.textContent = [switchReason, ...unspecified].filter(Boolean).join(' ');
  const host = document.querySelector('#opponent-actions')!;
  host.replaceChildren(table(actions.map((action) => [action.label, action.damage, pct(action.probability), String(action.modalScore), (action.kind === 'switch' ? action.reasons.join('\n') : action.reasons.slice(0, 4).join(' · '))]), ['Action', 'Damage', 'Chance', 'Score', 'Why']));
}

function buildAfterKo(): void {
  const controls = document.querySelector('#after-ko-controls') as HTMLElement;
  controls.append(
    select('ko-player-move', 'Your move', []),
    select('ko-opponent-move', 'Their hit', ['']),
    check('ko-sand', 'Sandstorm'),
    check('ko-hail', 'Hail'),
    check('ko-status', 'Status chip'),
    check('ko-seed', 'Leech Seed'),
  );
  const opponent = controls.querySelector('[data-key="ko-opponent-move"]') as HTMLSelectElement;
  opponent.options[0]!.textContent = "They don't hit you";
  controls.addEventListener('change', () => refresh());
}

function renderAfterKo(state: BattleSnapshot): void {
  const section = document.querySelector('#after-ko') as HTMLElement;
  const note = document.querySelector('#after-ko-note')!;
  const host = document.querySelector('#after-ko-table')!;
  const player = state.player.party[state.player.active];
  const rawAi = state.opponent.party[state.opponent.active];
  const ai = rawAi ? actingForme(rawAi) : undefined;
  const playerSelect = section.querySelector('[data-key="ko-player-move"]') as HTMLSelectElement;
  const opponentSelect = section.querySelector('[data-key="ko-opponent-move"]') as HTMLSelectElement;
  const sand = section.querySelector('[data-key="ko-sand"]') as HTMLInputElement;
  const hail = section.querySelector('[data-key="ko-hail"]') as HTMLInputElement;
  const status = section.querySelector('[data-key="ko-status"]') as HTMLInputElement;
  const seed = section.querySelector('[data-key="ko-seed"]') as HTMLInputElement;
  if (!player || !ai) {
    note.textContent = 'Set the active Pokémon on both sides.';
    host.replaceChildren();
    return;
  }
  const monKey = `${state.player.active}:${player.species}:${state.opponent.active}:${ai.species}`;
  const chipKey = `${state.field.weather}:${player.status}:${player.leechSeeded}`;
  fillSelect(playerSelect, player.moves.filter(Boolean).map((move) => ({ value: move, label: `${move} (${pct(koChance(estimateDamage(player, ai, move, state.field, state.player.side, state.opponent.side).rolls, ai.curHp))} KO)` })));
  fillSelect(opponentSelect, [{ value: '', label: "They don't hit you" }, ...ai.moves.filter(Boolean).map((move) => ({ value: move, label: move }))]);
  if (section.dataset.monKey !== monKey) {
    section.dataset.monKey = monKey;
    playerSelect.value = bestKoMove(state) ?? player.moves.find(Boolean) ?? '';
    opponentSelect.value = '';
  }
  if (section.dataset.chipKey !== chipKey) {
    section.dataset.chipKey = chipKey;
    sand.checked = state.field.weather === 'Sand';
    hail.checked = state.field.weather === 'Hail';
    status.checked = player.status === 'brn' || player.status === 'psn' || player.status === 'tox';
    seed.checked = player.leechSeeded;
  }
  const report = afterKo(state, {
    playerMove: playerSelect.value,
    opponentMove: opponentSelect.value,
    sand: sand.checked,
    hail: hail.checked,
    status: status.checked,
    leechSeed: seed.checked,
  });
  note.textContent = report.note;
  host.replaceChildren();
  if (report.sendIns.length) {
    const top = Math.max(...report.sendIns.map((row) => row.probability));
    host.append(table(
      report.sendIns.map((row) => [row.species, pct(row.probability), String(row.score), row.reasons.join('\n')]),
      ['Switch in', 'Chance', 'Score', 'Why'],
      report.sendIns.map((row) => row.probability === top && top > 0),
    ));
  }
}

function bestKoMove(state: BattleSnapshot): string | undefined {
  const player = state.player.party[state.player.active];
  const rawAi = state.opponent.party[state.opponent.active];
  const ai = rawAi ? actingForme(rawAi) : undefined;
  if (!player || !ai) return undefined;
  let best = '';
  let bestChance = 0;
  for (const move of player.moves) {
    if (!move) continue;
    const chance = koChance(estimateDamage(player, ai, move, state.field, state.player.side, state.opponent.side).rolls, ai.curHp);
    if (chance > bestChance) {
      best = move;
      bestChance = chance;
    }
  }
  return best || undefined;
}

function fillSelect(field: HTMLSelectElement, options: { value: string; label: string }[]): void {
  const selected = field.value;
  field.replaceChildren();
  for (const option of options) {
    const node = document.createElement('option');
    node.value = option.value;
    node.textContent = option.label;
    field.append(node);
  }
  if (options.some((option) => option.value === selected)) field.value = selected;
}

function renderReplies(replies: { label: string; faintRisk: number; koChance: number; expectedDamage: number; reason: string }[]): void {
  const host = document.querySelector('#replies')!;
  const rows = replies.map((reply, index) => {
    const cells = [reply.label, pct(reply.faintRisk), pct(reply.koChance), Math.round(reply.expectedDamage).toString(), reply.reason];
    return { cells, best: index === 0 };
  });
  host.replaceChildren(table(rows.map((row) => row.cells), ['Action', 'Faint risk', 'KO chance', 'Damage', 'Why'], rows.map((row) => row.best)));
}

function table(rows: string[][], headers: string[], best: boolean[] = []): HTMLTableElement {
  const tableEl = document.createElement('table');
  const head = document.createElement('tr');
  for (const header of headers) {
    const cell = document.createElement('th');
    cell.textContent = header;
    head.append(cell);
  }
  tableEl.append(head);
  rows.forEach((row, index) => {
    const tr = document.createElement('tr');
    if (best[index]) tr.classList.add('best-row');
    for (const value of row) {
      const cell = document.createElement('td');
      cell.textContent = value;
      tr.append(cell);
    }
    tableEl.append(tr);
  });
  return tableEl;
}

function partyOf(side: 'player' | 'opponent'): PokemonState[] {
  return side === 'player' ? snapshot.player.party : snapshot.opponent.party;
}

function activeIndex(side: 'player' | 'opponent'): number {
  return side === 'player' ? snapshot.player.active : snapshot.opponent.active;
}

function current(side: 'player' | 'opponent'): PokemonState | undefined {
  return partyOf(side)[activeIndex(side)];
}

function datalist(id: string, values: string[]): void {
  const list = document.createElement('datalist');
  list.id = id;
  for (const value of values) {
    const option = document.createElement('option');
    option.value = value;
    list.append(option);
  }
  document.body.append(list);
}

function input(key: string, label: string, valueText: string, list?: string): HTMLLabelElement {
  const wrap = document.createElement('label');
  wrap.textContent = label;
  const field = document.createElement('input');
  field.dataset.key = key;
  field.value = valueText;
  if (list) field.setAttribute('list', list);
  wrap.append(field);
  return wrap;
}

function num(key: string, label: string, min: number, max: number): HTMLLabelElement {
  const wrap = input(key, label, '');
  const field = wrap.querySelector('input')!;
  field.type = 'number';
  field.min = String(min);
  field.max = String(max);
  return wrap;
}

function select(key: string, label: string, values: string[], labels = values): HTMLLabelElement {
  const wrap = document.createElement('label');
  wrap.textContent = label;
  const field = document.createElement('select');
  field.dataset.key = key;
  values.forEach((value, index) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = labels[index] || value || 'None';
    field.append(option);
  });
  wrap.append(field);
  return wrap;
}

function check(key: string, label: string): HTMLLabelElement {
  const wrap = document.createElement('label');
  const field = document.createElement('input');
  field.type = 'checkbox';
  field.dataset.key = key;
  wrap.append(field, document.createTextNode(label));
  return wrap;
}

function set(editor: HTMLElement, key: string, valueText: string): void {
  const field = editor.querySelector(`[data-key="${key}"]`) as HTMLInputElement | HTMLSelectElement | null;
  if (field) field.value = valueText;
}

function value(editor: HTMLElement, key: string): string {
  const field = editor.querySelector(`[data-key="${key}"]`) as HTMLInputElement | HTMLSelectElement | null;
  return field?.value ?? '';
}

function numberValue(editor: HTMLElement, key: string, fallback: number): number {
  const parsed = Number(value(editor, key));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}
