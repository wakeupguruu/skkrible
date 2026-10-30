import './style.css';
import { BACKEND, RoomConnection, readStorage } from './connection.mjs';
import { DrawingBoard, COLORS, COLOR_NAMES } from './board.mjs';
import { FACE_COLORS, FACE_PARTS, decodeAvatar, encodeAvatar, validAvatar } from '../../shared/avatar.mjs';
import { avatarMarkup } from './avatar.mjs';

const $ = id => document.getElementById(id);
const codePattern = /^[A-HJ-NP-Z2-9]{8}$/;
const node = (tag, className = '', content = '') => {
  const element = document.createElement(tag); element.className = className; element.textContent = content; return element;
};
let savedProfile;
try { savedProfile = JSON.parse(localStorage.getItem('skkrible:profile')); } catch { /* A new profile works without storage. */ }
let profile = { name: savedProfile?.name ?? '', avatar: validAvatar(savedProfile?.avatar) ? savedProfile.avatar : 0 };
let connection = null, room = null, connected = false, overlayKey = '', chatKey = '', toastTimer, clockOffset = 0, settingsCommand = null;
let settingsKey = '', settingsDirty = false, startAfterSettings = false, showLobbySettings = false;
let selectedPlayer = null, feedbackTimer;
$('player-name').value = profile.name;

function toast(message) {
  $('toast').textContent = message; $('toast').hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4500);
}
function avatars() {
  $('avatar-preview').innerHTML = avatarMarkup(profile.avatar);
  const parts = decodeAvatar(profile.avatar);
  for (const [index, button] of [...$('avatar-picker').children].entries()) {
    button.classList.toggle('selected', index === parts.color); button.setAttribute('aria-pressed', String(index === parts.color));
  }
  for (const [key, count] of Object.entries(FACE_PARTS)) {
    const label = document.querySelector(`[data-part-label="${key}"]`);
    if (label) label.textContent = `${key === 'accessory' ? 'Hat' : key[0].toUpperCase() + key.slice(1)} ${parts[key] + 1}/${count}`;
  }
}
for (const key of ['eyes', 'mouth', 'accessory']) {
  const row = node('div', 'avatar-control'), label = node('span'); label.dataset.partLabel = key;
  for (const direction of [-1, 1]) {
    const button = node('button', '', direction === -1 ? '‹' : '›'); button.type = 'button';
    button.setAttribute('aria-label', `${direction === -1 ? 'Previous' : 'Next'} ${key}`);
    button.addEventListener('click', () => { const parts = decodeAvatar(profile.avatar); parts[key] = (parts[key] + direction + FACE_PARTS[key]) % FACE_PARTS[key]; profile.avatar = encodeAvatar(parts); avatars(); });
    row.append(button); if (direction === -1) row.append(label);
  }
  $('avatar-controls').append(row);
}
FACE_COLORS.forEach((color, index) => {
  const button = node('button', 'avatar-choice'); button.type = 'button'; button.style.background = color;
  button.setAttribute('aria-label', `Avatar color ${index + 1}`);
  button.addEventListener('click', () => { profile.avatar = encodeAvatar({ ...decodeAvatar(profile.avatar), color: index }); avatars(); });
  $('avatar-picker').append(button);
});
$('random-avatar').addEventListener('click', () => { profile.avatar = (profile.avatar + 1 + crypto.getRandomValues(new Uint32Array(1))[0] % 799) % 800; avatars(); });
avatars();
function saveProfile() {
  if (!$('play-form').reportValidity()) return false;
  profile.name = $('player-name').value.trim();
  if (!profile.name) { $('home-error').textContent = 'A nickname makes guessing who’s who easier.'; return false; }
  try { localStorage.setItem('skkrible:profile', JSON.stringify(profile)); } catch { /* Profile is retained in memory for this tab. */ }
  return true;
}
function busy(value, label = 'Connecting…') {
  $('create-room').disabled = $('join-room').disabled = value;
  $('create-room').firstChild.textContent = value ? `${label} ` : 'Create a private room ';
}
function homeError(error) {
  busy(false);
  $('home-error').textContent = error instanceof Error ? error.message : String(error);
}
async function request(path, options = {}) {
  if (!BACKEND) throw new Error('Rooms aren’t available just yet. Please try again soon.');
  let response;
  try { response = await fetch(`${BACKEND}${path}`, { ...options, signal: AbortSignal.timeout(15_000) }); }
  catch { throw new Error('Couldn’t reach the room. Check your connection and try again.'); }
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Couldn’t open that room. Please try again.');
  return data;
}
async function enterRoom(code) {
  await request(`/api/rooms/${code}`);
  connection?.close(); room = null; overlayKey = ''; chatKey = ''; settingsKey = ''; settingsDirty = false; showLobbySettings = false; settingsCommand = null; startAfterSettings = false;
  connection = new RoomConnection(code, profile, frame, status);
}
$('play-form').addEventListener('submit', async event => {
  event.preventDefault(); if (!saveProfile()) return;
  busy(true, 'Making room…'); $('home-error').textContent = '';
  try { const result = await request('/api/rooms', { method: 'POST' }); await enterRoom(result.code); }
  catch (error) { homeError(error); }
});
$('join-form').addEventListener('submit', async event => {
  event.preventDefault(); if (!saveProfile()) return;
  const code = $('room-code').value.trim().toUpperCase();
  if (!codePattern.test(code)) { homeError('Ask your friend for the 8-character room code.'); return; }
  busy(true); $('home-error').textContent = '';
  try { await enterRoom(code); } catch (error) { homeError(error); }
});
$('room-code').addEventListener('input', () => { $('room-code').value = $('room-code').value.toUpperCase().replace(/[^A-Z2-9]/g, ''); });
$('help-button').addEventListener('click', () => $('help-dialog').showModal());

const board = new DrawingBoard($('drawing-canvas'), $('preview-canvas'),
  (stroke, turnId) => connection?.command('stroke', { stroke, turnId }),
  (stroke, turnId) => connection?.ink(stroke, turnId));

function updateTools() {
  const isDrawer = connected && room?.phase === 'drawing' && room.drawerId === room.youId;
  document.body.classList.toggle('drawing-now', isDrawer);
  board.enable(isDrawer, room?.turnId ?? null, room?.phase !== 'drawing');
  for (const control of document.querySelectorAll('.drawing-toolbar button,.drawing-toolbar select')) control.disabled = !isDrawer;
  $('pen-tool').classList.toggle('selected', board.tool === 'pen');
  $('eraser-tool').classList.toggle('selected', board.tool === 'eraser');
  $('pen-tool').setAttribute('aria-pressed', String(board.tool === 'pen'));
  $('eraser-tool').setAttribute('aria-pressed', String(board.tool === 'eraser'));
  for (const [i, button] of [...$('colors').children].entries()) {
    button.classList.toggle('selected', COLORS[i] === board.color); button.setAttribute('aria-pressed', String(COLORS[i] === board.color));
  }
}
for (const [i, color] of COLORS.entries()) {
  const button = node('button', 'color-button'); button.style.background = color;
  button.type = 'button'; button.setAttribute('aria-label', `${COLOR_NAMES[i]} brush color`); button.title = COLOR_NAMES[i];
  button.addEventListener('click', () => { board.color = color; board.tool = 'pen'; updateTools(); }); $('colors').append(button);
}
$('pen-tool').addEventListener('click', () => { board.tool = 'pen'; updateTools(); });
$('eraser-tool').addEventListener('click', () => { board.tool = 'eraser'; updateTools(); });
$('brush-size').addEventListener('change', () => { board.size = Number($('brush-size').value); });
$('undo-button').addEventListener('click', () => connection?.command('undo', { turnId: room.turnId }));
$('clear-button').addEventListener('click', () => { if (confirm('Clear this drawing?')) connection?.command('clear', { turnId: room.turnId }); });
document.addEventListener('keydown', event => {
  if (!board.enabled || event.target.matches('input,textarea,select') || document.querySelector('dialog[open]')) return;
  if (event.key.toLowerCase() === 'b') { board.tool = 'pen'; updateTools(); }
  if (event.key.toLowerCase() === 'e') { board.tool = 'eraser'; updateTools(); }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); $('undo-button').click(); }
});

function status(value) {
  connected = value === 'connected';
  $('connection-status').className = `connection-status ${value}`;
  $('connection-status').textContent = ({ connected: 'Connected', connecting: 'Connecting…', reconnecting: 'Reconnecting · seat saved', stopped: 'Connection ended' })[value];
  updateTools();
  if (room) render();
}
function frame(message) {
  if (message.type === 'welcome' || message.type === 'snapshot') {
    const pending = connection.pending.filter(c => c.type === 'stroke' && c.turnId === message.room.turnId).map(c => c.stroke);
    room = message.room; clockOffset = room.serverNow - Date.now();
    board.snapshot(message.board, room.turnId, pending);
    $('home').hidden = true; $('game').hidden = false; busy(false);
    document.body.classList.add('in-game');
    const url = new URL(location.href); url.search = ''; url.searchParams.set('room', room.code); history.replaceState(null, '', url);
    render();
  } else if (message.type === 'state') {
    const previous = room?.turnId;
    room = message.room; clockOffset = room.serverNow - Date.now();
    if (previous !== room.turnId) { board.snapshot([], room.turnId); $('chat-input').value = ''; $('guess-feedback').hidden = true; }
    render();
  } else if (message.type === 'stroke') {
    board.commit(message.stroke, message.turnId);
  } else if (message.type === 'board') {
    if (message.turnId === room?.turnId) board.snapshot(message.board, message.turnId);
  } else if (message.type === 'ink') {
    board.preview(message.stroke, message.turnId);
  } else if (message.type === 'ack' && message.feedback) {
    $('guess-feedback').textContent = message.feedback === 'close' ? 'You’re close! Check the spelling.' : 'Not quite. Try again.';
    $('guess-feedback').classList.toggle('close', message.feedback === 'close'); $('guess-feedback').hidden = false;
    clearTimeout(feedbackTimer); feedbackTimer = setTimeout(() => { $('guess-feedback').hidden = true; }, 4500);
  } else if (message.type === 'ack' && message.id === settingsCommand) {
    settingsCommand = null; settingsDirty = false;
    if (startAfterSettings) { startAfterSettings = false; connection.command('start'); }
    else toast('Room settings saved.');
    renderSettings();
  } else if (message.type === 'error') {
    if (message.id === settingsCommand) { $('settings-error').textContent = message.message; settingsCommand = null; startAfterSettings = false; renderSettings(); }
    else if (!room) homeError(message.message);
    else toast(message.message);
    renderVote();
    const pendingIds = new Set(connection.pending.filter(c => c.type === 'stroke').map(c => c.stroke.id));
    for (const id of board.pending.keys()) if (!pendingIds.has(id)) board.pending.delete(id);
    board.paintOverlay();
  }
}
function render() {
  if (!room) return;
  const me = room.players.find(p => p.id === room.youId);
  const drawer = room.players.find(p => p.id === room.drawerId);
  const host = room.ownerId === room.youId;
  $('copy-room-code').textContent = room.code;
  $('player-count').textContent = `${room.players.length} / ${room.settings.maxPlayers}`;
  $('round-label').textContent = ['lobby', 'finished'].includes(room.phase) ? room.phase === 'finished' ? 'RESULTS' : 'LOBBY' : `Round ${Math.min(room.round, room.settings.rounds)} of ${room.settings.rounds}`;
  $('turn-label').textContent = ({ lobby: 'Invite friends to play', choosing: `${drawer?.name ?? 'Friend'} is choosing`, drawing: `${drawer?.name ?? 'Friend'} is drawing`, reveal: 'Next turn soon', finished: 'Final scores', paused: 'Waiting to reconnect' })[room.phase];
  const wordLabel = $('word-label'), wordDisplay = $('word-display');
  wordDisplay.classList.toggle('long-word', (room.word || room.mask).length > 18);
  wordDisplay.classList.toggle('mask', room.phase === 'drawing' && !room.word);
  if (room.phase === 'drawing') {
    wordLabel.textContent = room.drawerId === room.youId ? 'DRAW THIS' : me?.guessed ? 'YOU GUESSED IT!' : `GUESS THE WORD · ${Array.from(room.mask).filter(c => c !== ' ').length} LETTERS`;
    wordDisplay.textContent = room.word || room.mask;
  } else if (room.phase === 'reveal') { wordLabel.textContent = 'THE WORD WAS'; wordDisplay.textContent = room.word || '—'; }
  else { wordLabel.textContent = room.phase === 'lobby' ? 'ROOM SETUP' : room.phase === 'choosing' ? 'CHOOSING A WORD' : 'GAME OVER'; wordDisplay.textContent = room.phase === 'finished' ? 'Well played!' : room.phase === 'choosing' ? 'Get ready…' : 'Waiting for friends'; }
  $('settings-button').hidden = !host || room.phase === 'lobby';
  $('settings-button').disabled = !connected || !['lobby', 'finished'].includes(room.phase);
  const canChat = connected && room.phase === 'drawing' && !me?.guessed && room.drawerId !== room.youId;
  $('chat-input').disabled = $('send-chat').disabled = !canChat;
  $('chat-input').placeholder = !connected ? 'Reconnecting…' : room.phase === 'drawing' && me?.guessed ? 'You guessed it!' : room.phase === 'drawing' && room.drawerId === room.youId ? 'You’re drawing' : room.phase === 'drawing' ? 'Type your guess…' : 'Wait for the next drawing…';
  if (me?.guessed || room.phase !== 'drawing') $('guess-feedback').hidden = true;
  document.body.classList.toggle('showing-points', room.phase === 'reveal');
  $('drawing-note').textContent = room.phase === 'drawing' && room.drawerId === room.youId ? 'Your turn. Let the doodles do the talking.  B pen · E eraser · Ctrl+Z undo' : 'The tools are yours when it’s your turn.';
  if (room.phase !== 'finished') showLobbySettings = false;
  const lobby = room.phase === 'lobby' || (room.phase === 'finished' && showLobbySettings);
  $('lobby-panel').hidden = !lobby; $('board-wrap').hidden = lobby;
  updateTools(); renderPlayers(); renderChat(); renderSettings(); renderVote(); renderOverlay(host, drawer); updateClock();
}
function renderPlayers() {
  const list = $('players-list'), scrollTop = list.scrollTop, scrollLeft = list.scrollLeft;
  const sorted = [...room.players].sort((a, b) => b.score - a.score);
  $('players-list').replaceChildren(...sorted.map(player => {
    const item = node('div', `player${player.id === room.drawerId ? ' drawing' : ''}${!player.connected ? ' away' : ''}`);
    item.classList.toggle('guessed', player.guessed);
    item.dataset.playerId = player.id;
    item.append(node('span', 'player-rank', `#${sorted.findIndex(p => p.score === player.score) + 1}`));
    const avatar = node('span', 'player-avatar'); avatar.innerHTML = avatarMarkup(player.avatar); avatar.setAttribute('aria-hidden', 'true');
    const details = node('div', 'player-details'); const name = node(player.id === room.youId ? 'div' : 'button', 'player-name', player.name); name.title = player.name;
    if (player.id !== room.youId) { name.type = 'button'; name.setAttribute('aria-label', `Player actions for ${player.name}`); name.addEventListener('click', () => { selectedPlayer = player.id; renderVote(); $('player-dialog').showModal(); }); }
    if (player.id === room.youId) name.append(node('span', 'you-tag', ' (you)'));
    details.append(name);
    const score = node('div', 'player-score'); score.append(node('strong', '', String(player.score)), document.createTextNode(' points'));
    details.append(score);
    if (!player.connected || player.id === room.drawerId || player.guessed) details.append(node('div', 'player-activity', !player.connected ? 'Reconnecting…' : player.id === room.drawerId ? room.phase === 'choosing' ? '✎ Choosing' : room.phase === 'reveal' ? '✎ Drew this' : '✎ Drawing' : '✓ Guessed it'));
    if (room.phase === 'reveal') details.append(node('div', 'player-turn-points', `+${player.turnPoints ?? 0} this turn`));
    item.append(details, avatar);
    if (player.id === room.ownerId) { const crown = node('span', 'player-crown', '♛'); crown.title = 'Room host'; crown.setAttribute('aria-label', 'Room host'); item.append(crown); }
    return item;
  }));
  list.scrollTop = scrollTop; list.scrollLeft = scrollLeft;
}
function renderChat() {
  const messages = room.messages.filter(m => m.kind === 'correct');
  const key = messages.map(m => m.id).join(','); if (key === chatKey) return; chatKey = key;
  const list = $('chat-messages'); const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 70;
  const nodes = messages.map(message => node('div', 'chat-message correct', message.text));
  list.replaceChildren(...nodes);
  if (atBottom) list.scrollTop = list.scrollHeight;
}
function renderOverlay(host, drawer) {
  const overlay = $('board-overlay');
  const key = JSON.stringify([room.phase, room.turnId, room.youId, host, connected, showLobbySettings, room.choices, ['finished', 'reveal'].includes(room.phase) ? room.players.map(p => [p.id, p.score, p.turnPoints]) : room.players.length]);
  if (key === overlayKey) return; overlayKey = key;
  overlay.replaceChildren(); overlay.hidden = ['drawing', 'lobby'].includes(room.phase) || showLobbySettings;
  if (overlay.hidden) return;
  const addButton = (label, fn, primary = true) => {
    const button = node('button', primary ? 'primary-button' : 'secondary-button', label); button.disabled = !connected; button.addEventListener('click', fn); overlay.append(button);
  };
  if (room.phase === 'choosing') {
    overlay.append(node('div', 'overlay-art', '✎'), node('h2', '', room.drawerId === room.youId ? 'Choose a word' : `${drawer?.name ?? 'Your friend'} is choosing…`), node('p', '', room.drawerId === room.youId ? 'Pick a word to draw. Keep it secret!' : 'Get ready to guess.'));
    if (room.drawerId === room.youId) {
      const choices = node('div', 'word-choices');
      room.choices.forEach((word, index) => { const button = node('button', 'word-choice', word); button.disabled = !connected; button.addEventListener('click', () => { connection.command('choose', { index, turnId: room.turnId }); for (const b of choices.children) b.disabled = true; }); choices.append(button); }); overlay.append(choices);
    }
  } else if (room.phase === 'reveal') {
    overlay.style.background = '#fffffff5';
    overlay.append(node('div', 'eyebrow', `The word was ${room.word || '—'}`), node('h2', '', 'Points this turn'));
    const results = node('div', 'turn-results');
    [...room.players].sort((a, b) => (b.turnPoints ?? 0) - (a.turnPoints ?? 0)).forEach(player => {
      const row = node('div', 'turn-result'); row.append(node('span', '', player.name), node('strong', '', `+${player.turnPoints ?? 0}`)); results.append(row);
    });
    overlay.append(results);
  } else if (room.phase === 'paused') {
    overlay.append(node('h2', '', 'Game paused'), node('p', '', 'Your drawing and scores are saved. Play resumes when two players reconnect.'));
    addButton('Copy the invite  ↗', copyInvite);
  } else if (room.phase === 'finished') {
    overlay.append(node('div', 'eyebrow', 'THAT’S A WRAP'), node('h2', '', 'Nicely drawn, everyone.'));
    const podium = node('div', 'podium');
    [...room.players].sort((a, b) => b.score - a.score).slice(0, 3).forEach((p, i) => { const person = node('div', 'podium-person', `${i + 1}. ${p.name}`); const face = node('span', 'podium-avatar'); face.innerHTML = avatarMarkup(p.avatar); person.prepend(face); person.append(node('strong', '', `${p.score} points`)); podium.append(person); }); overlay.append(podium);
    if (host) addButton('One more round?  ↗', () => connection.command('start'));
    else overlay.append(node('p', '', 'Waiting for the host to start another game.'));
  }
  if (room.phase !== 'reveal') overlay.style.background = '';
}
function updateClock() {
  if (!room) return;
  const remaining = room.deadline ? Math.max(0, Math.ceil((room.deadline - Date.now() - clockOffset) / 1000)) : null;
  const points = room.phase === 'reveal';
  const earned = room.players.find(p => p.id === room.youId)?.turnPoints ?? 0;
  $('timer-value').textContent = points ? `+${earned}` : remaining === null ? '—' : String(remaining);
  $('timer').classList.toggle('is-points', points);
  $('timer').setAttribute('role', points ? 'status' : 'timer');
  const duration = room.phase === 'drawing' ? room.settings.drawTime : room.phase === 'choosing' ? 20 : 6;
  const fraction = remaining === null ? 0 : Math.min(1, Math.max(0, (room.deadline - Date.now() - clockOffset) / (duration * 1000)));
  $('timer-ring').style.strokeDashoffset = String(169.65 * (1 - fraction));
  $('round-progress').style.width = `${fraction * 100}%`;
  $('timer').classList.toggle('urgent', !points && remaining !== null && remaining <= 10);
  $('timer').setAttribute('aria-label', points ? `${earned} points earned this turn` : remaining === null ? 'No active timer' : `${remaining} seconds remaining`);
  const hintSeconds = room.nextHintAt ? Math.max(0, Math.ceil((room.nextHintAt - Date.now() - clockOffset) / 1000)) : null;
  $('hint-status').textContent = room.phase !== 'drawing' ? '' : room.settings.hints === 0 ? 'Letter hints off' : hintSeconds !== null ? `Hint ${room.hintsRevealed}/${room.hintCount} · next in ${hintSeconds}s` : `${room.hintsRevealed}/${room.hintCount} hints revealed`;
}
setInterval(updateClock, 250);

$('chat-form').addEventListener('submit', event => {
  event.preventDefault(); const value = $('chat-input').value.trim();
  if (!value || !connected || $('chat-input').disabled) return;
  if (connection.command('chat', { text: value, turnId: room.turnId })) $('chat-input').value = '';
});
function fitKeyboard() {
  const height = window.visualViewport?.height ?? innerHeight;
  document.documentElement.style.setProperty('--app-height', `${height}px`);
  document.body.classList.toggle('keyboard-small', height < 500);
  if (document.body.classList.contains('typing') && innerWidth <= 680) requestAnimationFrame(() => scrollTo(0, 0));
}
$('chat-input').addEventListener('focus', () => { document.body.classList.add('typing'); fitKeyboard(); });
$('chat-input').addEventListener('blur', () => document.body.classList.remove('typing'));
$('player-name').addEventListener('focus', () => { document.body.classList.add('editing-profile'); fitKeyboard(); });
$('player-name').addEventListener('blur', () => document.body.classList.remove('editing-profile'));
window.visualViewport?.addEventListener('resize', fitKeyboard);
window.addEventListener('resize', fitKeyboard); fitKeyboard();
async function copyInvite() {
  if (!room) return;
  const url = new URL('/', location.origin); url.searchParams.set('room', room.code);
  try { await navigator.clipboard.writeText(url.href); toast('Invite copied. Send it to the gang!'); }
  catch { $('invite-link').value = url.href; $('invite-dialog').showModal(); $('invite-link').select(); }
}
$('copy-invite').addEventListener('click', copyInvite); $('copy-room-code').addEventListener('click', copyInvite);
function leaveRoom(event) {
  if (event) event.preventDefault();
  if (room && !confirm(connected ? 'Leave this room? Your seat and score will be removed.' : 'Leave this page? While offline, your seat stays reserved. You can return using the same invite in this tab.')) return;
  if (room && connected) connection.command('leave');
  connection?.close(connected); connection = null; room = null; connected = false;
  board.snapshot([], null); board.enable(false, null, true);
  $('game').hidden = true; $('home').hidden = false; document.body.classList.remove('in-game', 'typing', 'editing-profile', 'showing-points');
  $('room-menu').classList.remove('open'); $('room-menu-button').setAttribute('aria-expanded', 'false');
  history.replaceState(null, '', '/'); busy(false); $('home-error').textContent = ''; $('room-code').value = '';
}
$('leave-room').addEventListener('click', leaveRoom);
document.querySelector('.brand').addEventListener('click', event => { if (room) leaveRoom(event); });
$('room-menu-button').addEventListener('click', () => { const open = $('room-menu').classList.toggle('open'); $('room-menu-button').setAttribute('aria-expanded', String(open)); });
$('settings-button').addEventListener('click', () => {
  if (!room) return; showLobbySettings = true; render(); $('settings-form').elements.rounds.focus();
});
function renderSettings() {
  if (!room) return;
  const form = $('settings-form'), host = room.ownerId === room.youId;
  const key = JSON.stringify([room.code, host, room.settings]);
  if (key !== settingsKey && (!settingsDirty || !host)) {
    for (const name of ['rounds', 'drawTime', 'maxPlayers', 'hints', 'wordCount', 'difficulty']) form.elements[name].value = room.settings[name] ?? ({ wordCount: 3, difficulty: 'normal' })[name];
    settingsKey = key;
  }
  for (const element of form.elements) element.disabled = !host || !connected || Boolean(settingsCommand);
  for (const option of form.elements.maxPlayers.options) option.disabled = Number(option.value) < room.players.length;
  const count = room.players.filter(p => p.connected).length;
  $('start-game').disabled ||= count < 2;
  $('save-settings').hidden = $('start-game').hidden = !host;
  $('settings-status').textContent = !host ? 'Waiting for the host to start' : settingsCommand ? 'Saving…' : settingsDirty ? 'Unsaved changes' : 'Your room, your rules';
  $('lobby-tip').textContent = count < 2 ? 'Share the invite link above. You need 2 players to start.' : host ? `${count} players ready. Start when everyone’s here.` : 'Waiting for the host to start.';
}
$('settings-form').addEventListener('input', () => { settingsDirty = true; $('settings-error').textContent = ''; $('settings-status').textContent = 'Unsaved changes'; });
$('settings-form').addEventListener('submit', event => {
  event.preventDefault(); if (!connected) return;
  const form = new FormData(event.target);
  startAfterSettings = event.submitter?.id === 'start-game';
  settingsCommand = connection.command('settings', { settings: { rounds: Number(form.get('rounds')), drawTime: Number(form.get('drawTime')), maxPlayers: Number(form.get('maxPlayers')), hints: Number(form.get('hints')), wordCount: Number(form.get('wordCount')), difficulty: form.get('difficulty') } });
  renderSettings();
});
function renderVote() {
  if (!room || !selectedPlayer) return;
  const player = room.players.find(p => p.id === selectedPlayer);
  if (!player) { $('player-dialog').close(); selectedPlayer = null; return; }
  $('vote-player-name').textContent = player.name; $('vote-avatar').innerHTML = avatarMarkup(player.avatar);
  const vote = room.voteKicks?.find(v => v.targetId === player.id);
  const eligible = room.players.filter(p => p.connected && p.id !== player.id).length;
  const required = vote?.required ?? Math.max(2, Math.floor(eligible / 2) + 1);
  $('vote-count').textContent = `${vote?.votes ?? 0} / ${required} votes${vote ? ' · 60-second vote' : ''}`;
  $('vote-kick-button').textContent = vote?.voted ? 'You voted to kick' : 'Vote to kick';
  $('vote-kick-button').disabled = !connected || Boolean(vote?.voted) || (vote ? !vote.eligible : eligible < 2);
  if (!vote && eligible < 2) $('vote-count').textContent = 'At least 3 connected players are needed to vote-kick.';
}
$('vote-kick-button').addEventListener('click', () => { if (selectedPlayer && connected) { connection.command('voteKick', { playerId: selectedPlayer }); $('vote-kick-button').disabled = true; } });
for (const dialog of document.querySelectorAll('dialog')) dialog.addEventListener('click', event => { if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close(); } });

const invite = new URLSearchParams(location.search).get('room')?.toUpperCase();
if (invite) {
  $('room-code').value = invite;
  if (codePattern.test(invite)) {
    $('join-title').textContent = 'You’re invited.';
    if (readStorage(`seat:${invite}`) && profile.name) { busy(true, 'Restoring your room…'); enterRoom(invite).catch(homeError); }
    else $('player-name').focus();
  } else homeError('That invite code doesn’t look right. Ask your friend for a fresh link.');
}
updateTools();
