import './style.css';
import { BACKEND, RoomConnection, readStorage } from './connection.mjs';
import { DrawingBoard, COLORS, COLOR_NAMES } from './board.mjs';

const $ = id => document.getElementById(id);
const AVATARS = ['🐸', '🦊', '🐱', '🐨', '🐼', '🐻', '🐰', '🐙'];
const AVATAR_NAMES = ['Frog', 'Fox', 'Cat', 'Koala', 'Panda', 'Bear', 'Rabbit', 'Octopus'];
const codePattern = /^[A-HJ-NP-Z2-9]{8}$/;
const node = (tag, className = '', content = '') => {
  const element = document.createElement(tag); element.className = className; element.textContent = content; return element;
};
let savedProfile;
try { savedProfile = JSON.parse(localStorage.getItem('skkrible:profile')); } catch { /* A new profile works without storage. */ }
let profile = { name: savedProfile?.name ?? '', avatar: Number.isInteger(savedProfile?.avatar) ? savedProfile.avatar : 0 };
let connection = null, room = null, connected = false, overlayKey = '', chatKey = '', toastTimer, clockOffset = 0, settingsCommand = null;
$('player-name').value = profile.name;

function toast(message) {
  $('toast').textContent = message; $('toast').hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4500);
}
function avatars() {
  $('avatar-picker').replaceChildren(...AVATARS.map((avatar, i) => {
    const button = node('button', `avatar-choice${profile.avatar === i ? ' selected' : ''}`, avatar);
    button.type = 'button'; button.setAttribute('aria-label', `${AVATAR_NAMES[i]} avatar`); button.setAttribute('aria-pressed', String(profile.avatar === i));
    button.addEventListener('click', () => { profile.avatar = i; avatars(); }); return button;
  }));
}
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
  connection?.close(); room = null; overlayKey = ''; chatKey = '';
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
    if (previous !== room.turnId) { board.snapshot([], room.turnId); $('chat-input').value = ''; }
    render();
  } else if (message.type === 'stroke') {
    board.commit(message.stroke, message.turnId);
  } else if (message.type === 'board') {
    if (message.turnId === room?.turnId) board.snapshot(message.board, message.turnId);
  } else if (message.type === 'ink') {
    board.preview(message.stroke, message.turnId);
  } else if (message.type === 'ack' && message.id === settingsCommand) {
    $('settings-dialog').close(); settingsCommand = null; toast('Room settings saved.');
  } else if (message.type === 'error') {
    if (message.id === settingsCommand) { $('settings-error').textContent = message.message; settingsCommand = null; }
    else if (!room) homeError(message.message);
    else toast(message.message);
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
  $('round-label').textContent = ['lobby', 'finished'].includes(room.phase) ? room.phase === 'finished' ? 'THE FINAL MASTERPIECES' : 'WAITING FOR FRIENDS' : `ROUND ${Math.min(room.round, room.settings.rounds)} OF ${room.settings.rounds}`;
  $('turn-label').textContent = ({ lobby: 'Your next masterpiece awaits.', choosing: `${drawer?.name ?? 'A friend'} is choosing a word.`, drawing: `${drawer?.name ?? 'A friend'} is drawing${room.drawerId === room.youId ? ' (that’s you!)' : ''}.`, reveal: 'Some truly inspired guesses.', finished: 'That was beautifully chaotic.', paused: 'Your room is saved. We’ll wait.' })[room.phase];
  const wordLabel = $('word-label'), wordDisplay = $('word-display');
  wordDisplay.classList.toggle('mask', room.phase === 'drawing' && !room.word);
  if (room.phase === 'drawing') {
    wordLabel.textContent = room.drawerId === room.youId ? 'DRAW THIS · NO SPELLING IT OUT' : me?.guessed ? 'YOU GOT IT! ENJOY THE MASTERPIECE' : 'WHAT COULD IT POSSIBLY BE?';
    wordDisplay.textContent = room.word || room.mask;
  } else if (room.phase === 'reveal') { wordLabel.textContent = 'THE WORD WAS'; wordDisplay.textContent = room.word || '—'; }
  else { wordLabel.textContent = 'GRAB A FRIEND AND A LITTLE IMAGINATION'; wordDisplay.textContent = room.phase === 'finished' ? 'beautifully done, everyone.' : 'let’s draw something.'; }
  $('settings-button').hidden = !host;
  $('settings-button').disabled = !connected || !['lobby', 'finished'].includes(room.phase);
  const canChat = connected && !(room.phase === 'drawing' && (me?.guessed || room.drawerId === room.youId));
  $('chat-input').disabled = $('send-chat').disabled = !canChat;
  $('chat-input').placeholder = !connected ? 'Reconnecting… keep your guess.' : room.phase === 'drawing' && me?.guessed ? 'You got it! ✨' : room.phase === 'drawing' && room.drawerId === room.youId ? 'Let your drawing do the talking.' : room.phase === 'drawing' ? 'Type your guess…' : 'Say hi to the gang…';
  $('chat-hint').textContent = room.phase === 'drawing' && !canChat && connected ? 'Keep the word a secret until the reveal.' : 'Press enter to send. Wild guesses welcome.';
  $('drawing-note').textContent = room.phase === 'drawing' && room.drawerId === room.youId ? 'Your turn. Let the doodles do the talking.  B pen · E eraser · Ctrl+Z undo' : 'The tools are yours when it’s your turn.';
  updateTools(); renderPlayers(); renderChat(); renderOverlay(host, drawer); updateClock();
}
function renderPlayers() {
  const sorted = [...room.players].sort((a, b) => b.score - a.score);
  $('players-list').replaceChildren(...sorted.map(player => {
    const item = node('div', `player${player.id === room.drawerId ? ' drawing' : ''}${!player.connected ? ' away' : ''}`);
    const avatar = node('span', 'player-avatar', AVATARS[player.avatar] ?? AVATARS[0]); avatar.setAttribute('aria-hidden', 'true'); item.append(avatar);
    const details = node('div', 'player-details'); const name = node('div', 'player-name', player.name); name.title = player.name;
    if (player.id === room.youId) name.append(node('span', 'you-tag', ' (you)'));
    details.append(name);
    const score = node('div', 'player-score'); score.append(node('strong', '', String(player.score)), document.createTextNode(' points'));
    details.append(score);
    if (!player.connected || player.guessed || player.id === room.drawerId) details.append(node('div', 'player-activity', !player.connected ? 'reconnecting…' : player.guessed ? '✓ guessed it!' : '✎ artist on duty'));
    item.append(details);
    if (player.id === room.ownerId) { const crown = node('span', 'player-crown', '♛'); crown.title = 'Room host'; crown.setAttribute('aria-label', 'Room host'); item.append(crown); }
    if (room.ownerId === room.youId && player.id !== room.youId) {
      const kick = node('button', 'kick-button', '×'); kick.setAttribute('aria-label', `Remove ${player.name} from room`); kick.title = `Remove ${player.name}`; kick.disabled = !connected;
      kick.addEventListener('click', () => { if (confirm(`Remove ${player.name} from the room?`)) connection.command('kick', { playerId: player.id }); }); item.append(kick);
    }
    return item;
  }));
}
function renderChat() {
  const key = room.messages.map(m => m.id).join(','); if (key === chatKey) return; chatKey = key;
  const list = $('chat-messages'); const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 70;
  const nodes = room.messages.map(message => {
    const item = node('div', `chat-message ${message.kind}`);
    if (message.kind === 'chat') item.append(node('span', 'chat-name', message.name), node('span', 'chat-body', message.text));
    else item.textContent = message.text;
    return item;
  });
  list.replaceChildren(...nodes);
  if (atBottom) list.scrollTop = list.scrollHeight;
}
function renderOverlay(host, drawer) {
  const overlay = $('board-overlay');
  const key = JSON.stringify([room.phase, room.turnId, room.youId, host, connected, room.choices, room.phase === 'finished' ? room.players.map(p => [p.id, p.score]) : room.players.length]);
  if (key === overlayKey) return; overlayKey = key;
  overlay.replaceChildren(); overlay.hidden = room.phase === 'drawing';
  if (room.phase === 'drawing') return;
  const addButton = (label, fn, primary = true) => {
    const button = node('button', primary ? 'primary-button' : 'secondary-button', label); button.disabled = !connected; button.addEventListener('click', fn); overlay.append(button);
  };
  if (room.phase === 'lobby') {
    overlay.append(node('div', 'overlay-art', '🐸 ✎ 🦊'), node('div', 'eyebrow', 'GOOD COMPANY, QUESTIONABLE ART'), node('h2', '', 'Everybody in?'), node('p', '', 'Send the invite to your group chat. The best drawings are the ones nobody understands.'));
    addButton(host ? room.players.filter(p => p.connected).length >= 2 ? 'Let’s get drawing!  ↗' : 'Waiting for a friend…' : 'Invite another friend  ↗', () => host ? connection.command('start') : copyInvite());
    if (host && room.players.filter(p => p.connected).length < 2) overlay.querySelector('button').disabled = true;
  } else if (room.phase === 'choosing') {
    overlay.append(node('div', 'overlay-art', '✎'), node('div', 'eyebrow', room.drawerId === room.youId ? 'YOUR MOMENT OF GLORY' : 'THE SUSPENSE IS REAL'), node('h2', '', room.drawerId === room.youId ? 'What are we drawing?' : `${drawer?.name ?? 'Your friend'} is picking a word…`), node('p', '', room.drawerId === room.youId ? 'Pick one. Keep it a secret. Make it a masterpiece.' : 'Get your wild guesses ready.'));
    if (room.drawerId === room.youId) {
      const choices = node('div', 'word-choices');
      room.choices.forEach((word, index) => { const button = node('button', 'word-choice', word); button.disabled = !connected; button.addEventListener('click', () => { connection.command('choose', { index, turnId: room.turnId }); for (const b of choices.children) b.disabled = true; }); choices.append(button); }); overlay.append(choices);
    }
  } else if (room.phase === 'reveal') {
    overlay.style.background = '#fffdfbe8';
    overlay.append(node('div', 'eyebrow', 'AND THE WORD WAS…'), node('h2', 'reveal-word', room.word || 'a mystery'), node('p', '', 'Take a breath. The next masterpiece is coming up.'));
  } else if (room.phase === 'paused') {
    overlay.append(node('div', 'overlay-art', '☁'), node('h2', '', 'Taking a tiny breather.'), node('p', '', 'Your drawing and scores are saved. We’ll carry on when two friends are back.'));
    addButton('Copy the invite  ↗', copyInvite);
  } else if (room.phase === 'finished') {
    overlay.append(node('div', 'eyebrow', 'THAT’S A WRAP'), node('h2', '', 'Nicely drawn, everyone.'));
    const podium = node('div', 'podium');
    [...room.players].sort((a, b) => b.score - a.score).slice(0, 3).forEach((p, i) => { const person = node('div', 'podium-person', p.name); person.prepend(node('span', 'podium-avatar', `${['🥇', '🥈', '🥉'][i]}${AVATARS[p.avatar]}`)); person.append(node('strong', '', `${p.score} points`)); podium.append(person); }); overlay.append(podium);
    if (host) addButton('One more round?  ↗', () => connection.command('start'));
    else overlay.append(node('p', '', 'Waiting for the host to start another game.'));
  }
  if (room.phase !== 'reveal') overlay.style.background = '';
}
function updateClock() {
  if (!room) return;
  const remaining = room.deadline ? Math.max(0, Math.ceil((room.deadline - Date.now() - clockOffset) / 1000)) : null;
  $('timer').textContent = remaining === null ? '—' : String(remaining);
  $('timer').classList.toggle('urgent', remaining !== null && remaining <= 10);
  $('timer').setAttribute('aria-label', remaining === null ? 'No active timer' : `${remaining} seconds remaining`);
}
setInterval(updateClock, 250);

$('chat-form').addEventListener('submit', event => {
  event.preventDefault(); const value = $('chat-input').value.trim();
  if (!value || !connected || $('chat-input').disabled) return;
  if (connection.command('chat', { text: value, turnId: room.turnId })) $('chat-input').value = '';
});
function fitKeyboard() {
  document.documentElement.style.setProperty('--app-height', `${window.visualViewport?.height ?? innerHeight}px`);
  if (document.body.classList.contains('typing') && innerWidth <= 680) requestAnimationFrame(() => scrollTo(0, 0));
}
$('chat-input').addEventListener('focus', () => { document.body.classList.add('typing'); fitKeyboard(); });
$('chat-input').addEventListener('blur', () => document.body.classList.remove('typing'));
window.visualViewport?.addEventListener('resize', fitKeyboard);
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
  $('game').hidden = true; $('home').hidden = false; document.body.classList.remove('in-game');
  history.replaceState(null, '', '/'); busy(false); $('home-error').textContent = ''; $('room-code').value = '';
}
$('leave-room').addEventListener('click', leaveRoom);
document.querySelector('.brand').addEventListener('click', event => { if (room) leaveRoom(event); });
$('settings-button').addEventListener('click', () => {
  if (!room) return;
  const form = $('settings-form');
  for (const key of ['rounds', 'drawTime', 'maxPlayers', 'hints']) form.elements[key].value = room.settings[key];
  form.elements.customWords.value = room.settings.customWords.join(', '); form.elements.customOnly.checked = room.settings.customOnly;
  $('settings-error').textContent = ''; $('settings-dialog').showModal();
});
$('settings-form').addEventListener('submit', event => {
  event.preventDefault(); if (!connected) return;
  const form = new FormData(event.target);
  settingsCommand = connection.command('settings', { settings: { rounds: Number(form.get('rounds')), drawTime: Number(form.get('drawTime')), maxPlayers: Number(form.get('maxPlayers')), hints: Number(form.get('hints')), customWords: form.get('customWords'), customOnly: form.has('customOnly') } });
});
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
