import { WORDS, EASY_WORDS, HARD_WORDS } from './words.mjs';
import { validAvatar } from '../shared/avatar.mjs';

export const ROOM_TTL = 24 * 60 * 60 * 1000;
export const PALETTE = ['#252a34', '#ffffff', '#868e96', '#f03e3e', '#f76707', '#fcc419', '#40c057', '#12b886', '#15aabf', '#228be6', '#7950f2', '#be4bdb', '#f06595', '#a66b46'];
const ACTIVE = ['choosing', 'drawing', 'reveal'];
const normalize = text => text.normalize('NFKC').toLocaleLowerCase('en').replace(/[\s\p{P}]+/gu, '');
function closeGuess(guess, answer) {
  const a = Array.from(normalize(guess)), b = Array.from(normalize(answer));
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < Math.min(a.length, b.length) && a[i] === b[i]) i++;
  const tail = (letters, start) => letters.slice(start).join('');
  if (a.length !== b.length) return a.length > b.length ? tail(a, i + 1) === tail(b, i) : tail(a, i) === tail(b, i + 1);
  return tail(a, i + 1) === tail(b, i + 1) || (a[i] === b[i + 1] && a[i + 1] === b[i] && tail(a, i + 2) === tail(b, i + 2));
}
const fail = message => { throw new Error(message); };
export function text(value, min, max, label) {
  if (typeof value !== 'string') fail(`${label} must be text.`);
  const result = value.normalize('NFKC').replace(/[\p{Cc}\p{Cf}]/gu, '').trim();
  if (result.length < min || result.length > max) fail(`${label} must be ${min}–${max} characters.`);
  return result;
}
const integer = (n, min, max) => Number.isInteger(n) && n >= min && n <= max;
function say(room, message, now, player = null, kind = 'system', id = crypto.randomUUID()) {
  room.messages.push({ id, text: message, name: player?.name ?? '', playerId: player?.id ?? null, kind, at: now });
  room.messages = room.messages.slice(-80);
}
export function createRoom(code, now = Date.now()) {
  return { code, createdAt: now, updatedAt: now, expiresAt: now + ROOM_TTL, players: [], ownerId: null,
    phase: 'lobby', round: 0, turnIndex: -1, order: [], drawerId: null, turnId: null, word: '', choices: [],
    deadline: null, drawingStartedAt: null, disconnectDeadline: null, pausedPhase: null, remaining: 0,
    hintsRevealed: 0, hintOrder: [], board: [], messages: [], usedWords: [], kickVotes: [],
    settings: { rounds: 3, drawTime: 80, maxPlayers: 12, hints: 2, wordCount: 3, difficulty: 'normal' } };
}
export function joinRoom(room, input, now = Date.now()) {
  if (now >= room.expiresAt) fail('This room has expired. Create a new one.');
  let player = input.token ? room.players.find(p => p.token === input.token) : null;
  if (input.token && !player) fail('Your saved seat is no longer in this room. Join again with a new seat.');
  if (!player) {
    if (room.players.length >= room.settings.maxPlayers) fail('This room is full. Ask the host to increase the limit.');
    player = { id: crypto.randomUUID(), token: crypto.randomUUID(), name: text(input.name, 1, 20, 'Name'),
      avatar: validAvatar(input.avatar) ? input.avatar : 0, score: 0, turnPoints: 0, connected: true, guessed: false, receipts: [] };
    room.players.push(player);
    if (!['lobby', 'finished'].includes(room.phase)) room.order.push(player.id);
    say(room, `${player.name} joined the room.`, now);
  } else {
    player.connected = true;
    if (room.drawerId === player.id) room.disconnectDeadline = null;
  }
  room.ownerId ??= player.id;
  room.updatedAt = now;
  room.expiresAt = now + ROOM_TTL;
  resume(room, now);
  return player;
}
export function disconnect(room, playerId, now = Date.now()) {
  const player = room.players.find(p => p.id === playerId);
  if (!player) return;
  player.connected = false;
  if (room.ownerId === playerId) room.ownerId = room.players.find(p => p.connected)?.id ?? null;
  if (room.drawerId === playerId && ['choosing', 'drawing'].includes(room.phase)) {
    room.disconnectDeadline = Math.min(room.deadline, now + 30_000);
  }
  if (ACTIVE.includes(room.phase) && !room.players.some(p => p.connected)) {
    room.pausedPhase = room.phase;
    room.remaining = Math.max(0, room.deadline - now);
    room.phase = 'paused';
    room.deadline = null;
    room.disconnectDeadline = null;
  }
}
function resume(room, now) {
  if (room.phase !== 'paused' || room.players.filter(p => p.connected).length < 2) return;
  room.phase = room.pausedPhase;
  room.deadline = now + Math.max(1000, room.remaining);
  if (room.phase === 'drawing') room.drawingStartedAt = room.deadline - room.settings.drawTime * 1000;
  const drawer = room.players.find(p => p.id === room.drawerId);
  room.disconnectDeadline = drawer?.connected || room.phase === 'reveal' ? null : Math.min(room.deadline, now + 30_000);
  say(room, 'Everyone is back. Let’s keep going!', now);
}
function shuffled(values) {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
function selectWords(room) {
  const builtIn = ({ easy: EASY_WORDS, normal: WORDS, hard: HARD_WORDS })[room.settings.difficulty ?? 'normal'];
  const all = builtIn;
  const count = room.settings.wordCount ?? 3;
  let pool = all.filter(w => !room.usedWords.includes(w));
  if (pool.length < count) { room.usedWords = []; pool = all; }
  return shuffled(pool).slice(0, count);
}
function hintTime(room, index) {
  return room.drawingStartedAt + room.settings.drawTime * 1000 * index / (room.settings.hints + 1);
}
function nextTurn(room, now) {
  room.board = [];
  room.choices = [];
  room.word = '';
  room.disconnectDeadline = null;
  if (room.players.filter(p => p.connected).length < 2) {
    room.phase = 'finished'; room.deadline = null; room.drawerId = null;
    say(room, 'Game finished. Invite a friend to play again.', now); return;
  }
  for (let i = 0; i <= room.order.length * room.settings.rounds; i++) {
    room.turnIndex++;
    if (room.turnIndex >= room.order.length) { room.turnIndex = 0; room.round++; }
    if (room.round > room.settings.rounds) {
      room.phase = 'finished'; room.deadline = null; room.drawerId = null;
      say(room, 'That’s a wrap! The final scores are in.', now); return;
    }
    const drawer = room.players.find(p => p.id === room.order[room.turnIndex] && p.connected);
    if (!drawer) continue;
    for (const p of room.players) { p.guessed = false; p.turnPoints = 0; }
    room.drawerId = drawer.id;
    room.turnId = crypto.randomUUID();
    room.choices = selectWords(room);
    room.phase = 'choosing';
    room.deadline = now + 20_000;
    room.hintsRevealed = 0;
    room.hintOrder = [];
    say(room, `${drawer.name} is choosing a word.`, now);
    return;
  }
}
function choose(room, index, now) {
  room.word = room.choices[index];
  room.usedWords.push(room.word);
  room.usedWords = room.usedWords.slice(-100);
  room.choices = [];
  room.phase = 'drawing';
  room.drawingStartedAt = now;
  room.deadline = now + room.settings.drawTime * 1000;
  room.hintOrder = shuffled(Array.from(room.word).map((letter, i) => /\s/.test(letter) ? -1 : i).filter(i => i >= 0));
}
function reveal(room, now, reason = 'Time’s up!') {
  room.phase = 'reveal'; room.deadline = now + 6000; room.disconnectDeadline = null;
  say(room, `${reason} The word was “${room.word || room.choices[0] || '—'}”.`, now);
}
export function tick(room, now = Date.now()) {
  let changed = false;
  if (room.kickVotes?.some(vote => vote.expiresAt <= now)) {
    room.kickVotes = room.kickVotes.filter(vote => vote.expiresAt > now); changed = true;
  }
  if (room.disconnectDeadline && now >= room.disconnectDeadline && ['choosing', 'drawing'].includes(room.phase)) {
    reveal(room, now, 'The drawer couldn’t reconnect.'); return true;
  }
  if (room.phase === 'drawing') {
    const hints = Math.min(room.settings.hints, room.hintOrder.length - 1,
      Math.max(0, Math.floor((now - room.drawingStartedAt) / (room.settings.drawTime * 1000) * (room.settings.hints + 1))));
    if (hints > room.hintsRevealed) { room.hintsRevealed = hints; changed = true; }
  }
  if (!room.deadline || now < room.deadline) return changed;
  if (room.phase === 'choosing') choose(room, 0, now);
  else if (room.phase === 'drawing') reveal(room, now);
  else if (room.phase === 'reveal') nextTurn(room, now);
  else return changed;
  return true;
}
export function nextAlarm(room, now = Date.now()) {
  const alarms = [room.expiresAt];
  for (const vote of room.kickVotes ?? []) alarms.push(vote.expiresAt);
  if (room.deadline) alarms.push(room.deadline);
  if (room.disconnectDeadline) alarms.push(room.disconnectDeadline);
  const availableHints = Math.min(room.settings.hints, Math.max(0, room.hintOrder.length - 1));
  if (room.phase === 'drawing' && availableHints > room.hintsRevealed) {
    alarms.push(hintTime(room, room.hintsRevealed + 1));
  }
  return Math.max(now + 100, Math.min(...alarms));
}
export function validateStroke(input) {
  if (!input || typeof input.id !== 'string' || !/^[a-zA-Z0-9-]{8,64}$/.test(input.id) || !PALETTE.includes(input.color) ||
    ![4, 10, 20, 32].includes(input.size) || !['pen', 'eraser'].includes(input.tool) ||
    !Array.isArray(input.points) || input.points.length < 1 || input.points.length > 2048 ||
    input.points.some(p => !Array.isArray(p) || p.length !== 2 || p.some((n, i) => !Number.isFinite(n) || n < 0 || n > (i ? 750 : 1000)))) {
    fail('That brush stroke is not valid.');
  }
  return { id: input.id, color: input.color, size: input.size, tool: input.tool, points: input.points.map(p => p.map(Math.round)) };
}
export function action(room, playerId, message, now = Date.now()) {
  const player = room.players.find(p => p.id === playerId);
  if (!player || !player.connected) fail('Join the room before playing.');
  if (!message || typeof message.id !== 'string' || !/^[a-zA-Z0-9-]{8,64}$/.test(message.id)) fail('Missing command ID.');
  if (player.receipts.includes(message.id)) return { duplicate: true, events: [] };
  const events = [];
  let feedback;
  const host = () => { if (playerId !== room.ownerId) fail('Only the room host can do that.'); };
  const drawer = () => {
    if (room.phase !== 'drawing' || playerId !== room.drawerId || message.turnId !== room.turnId) fail('It’s not your drawing turn.');
  };
  switch (message.type) {
    case 'settings': {
      host();
      if (!['lobby', 'finished'].includes(room.phase)) fail('Change settings between games.');
      const s = message.settings;
      const wordCount = s?.wordCount ?? 3, difficulty = s?.difficulty ?? 'normal';
      if (!s || !integer(s.rounds, 1, 5) || ![30, 60, 80, 120].includes(s.drawTime) ||
        !integer(s.maxPlayers, Math.max(2, room.players.length), 20) || !integer(s.hints, 0, 5) || !integer(wordCount, 1, 5) ||
        !['easy', 'normal', 'hard'].includes(difficulty)) fail('Check your room settings.');
      room.settings = { rounds: s.rounds, drawTime: s.drawTime, maxPlayers: s.maxPlayers, hints: s.hints, wordCount, difficulty };
      break;
    }
    case 'start':
      host();
      if (!['lobby', 'finished'].includes(room.phase)) fail('A game is already in progress.');
      if (room.players.filter(p => p.connected).length < 2) fail('You need at least 2 connected players to start.');
      for (const p of room.players) p.score = 0;
      room.order = room.players.filter(p => p.connected).map(p => p.id);
      room.round = 1; room.turnIndex = -1; room.usedWords = [];
      nextTurn(room, now);
      break;
    case 'choose':
      if (room.phase !== 'choosing' || playerId !== room.drawerId || message.turnId !== room.turnId || !integer(message.index, 0, room.choices.length - 1)) fail('Choose one of your current words.');
      choose(room, message.index, now);
      break;
    case 'chat': {
      const value = text(message.text, 1, 160, 'Message');
      if (room.phase !== 'drawing' || message.turnId !== room.turnId) fail('The turn changed. Wait for the next drawing to guess.');
      if (playerId === room.drawerId || player.guessed) fail('Keep the word a secret until the reveal.');
      if (normalize(value) === normalize(room.word)) {
        player.guessed = true;
        const points = 100 + Math.round(400 * Math.max(0, (room.deadline - now) / (room.settings.drawTime * 1000)));
        player.score += points;
        player.turnPoints = (player.turnPoints ?? 0) + points;
        const artist = room.players.find(p => p.id === room.drawerId);
        if (artist) { artist.score += 50; artist.turnPoints = (artist.turnPoints ?? 0) + 50; }
        say(room, `${player.name} guessed the word!`, now, player, 'correct', message.id);
        if (room.players.filter(p => p.connected && p.id !== room.drawerId).every(p => p.guessed)) reveal(room, now, 'Everyone got it!');
      } else feedback = closeGuess(value, room.word) ? 'close' : 'miss';
      break;
    }
    case 'stroke': {
      drawer();
      const stroke = validateStroke(message.stroke);
      if (!room.board.some(s => s.id === stroke.id)) {
        if (room.board.length >= 1200 || room.board.reduce((sum, s) => sum + s.points.length, 0) + stroke.points.length > 40_000) fail('The board is full. Clear it to keep drawing.');
        room.board.push(stroke);
        events.push({ type: 'stroke', turnId: room.turnId, stroke });
      }
      break;
    }
    case 'undo': drawer(); room.board.pop(); events.push({ type: 'board', turnId: room.turnId, board: room.board }); break;
    case 'clear': drawer(); room.board = []; events.push({ type: 'board', turnId: room.turnId, board: [] }); break;
    case 'voteKick': {
      if (message.playerId === playerId) fail('You cannot vote to kick yourself.');
      const removed = room.players.find(p => p.id === message.playerId);
      if (!removed) fail('That player already left.');
      room.kickVotes = (room.kickVotes ?? []).filter(vote => vote.expiresAt > now);
      let vote = room.kickVotes.find(v => v.targetId === removed.id);
      if (!vote) {
        const eligible = room.players.filter(p => p.connected && p.id !== removed.id).map(p => p.id);
        if (eligible.length < 2) fail('Vote-kicking needs at least two other connected players.');
        vote = { targetId: removed.id, eligible, voters: [], required: Math.max(2, Math.floor(eligible.length / 2) + 1), expiresAt: now + 60_000 };
        room.kickVotes.push(vote);
      }
      if (!vote.eligible.includes(playerId)) fail('Join the next vote after this one expires.');
      if (!vote.voters.includes(playerId)) vote.voters.push(playerId);
      if (vote.voters.length >= vote.required) {
        disconnect(room, removed.id, now);
        room.players = room.players.filter(p => p.id !== removed.id);
        clearVotes(room, removed.id);
        if (room.drawerId === removed.id && ['choosing', 'drawing'].includes(room.phase)) reveal(room, now, 'The drawer was voted out.');
        else if (room.phase === 'drawing' && room.players.filter(p => p.connected && p.id !== room.drawerId).every(p => p.guessed)) reveal(room, now, 'Everyone got it!');
        events.push({ type: 'removed', playerId: removed.id });
      }
      break;
    }
    case 'leave':
      disconnect(room, playerId, now);
      room.players = room.players.filter(p => p.id !== playerId);
      clearVotes(room, playerId);
      say(room, `${player.name} left the room.`, now);
      break;
    default: fail('Unknown game command.');
  }
  player.receipts.push(message.id);
  player.receipts = player.receipts.slice(-100);
  room.updatedAt = now;
  room.expiresAt = now + ROOM_TTL;
  return { duplicate: false, events, feedback };
}
function clearVotes(room, playerId) {
  room.kickVotes = (room.kickVotes ?? []).filter(vote => vote.targetId !== playerId);
  for (const vote of room.kickVotes) vote.voters = vote.voters.filter(id => id !== playerId);
}
export function view(room, playerId, now = Date.now()) {
  const player = room.players.find(p => p.id === playerId);
  const isDrawer = playerId === room.drawerId;
  const publicWord = ['reveal', 'finished'].includes(room.phase) || isDrawer || player?.guessed;
  const hints = new Set(room.hintOrder.slice(0, room.hintsRevealed));
  return { code: room.code, phase: room.phase, ownerId: room.ownerId, youId: playerId, round: room.round,
    drawerId: room.drawerId, turnId: room.turnId, deadline: room.deadline, serverNow: now,
    // Empty legacy fields keep already-open clients usable until they refresh; custom lists are ignored.
    settings: { rounds: room.settings.rounds, drawTime: room.settings.drawTime, maxPlayers: room.settings.maxPlayers, hints: room.settings.hints, wordCount: room.settings.wordCount ?? 3, difficulty: room.settings.difficulty ?? 'normal', customWords: [], customOnly: false },
    hintsRevealed: room.hintsRevealed,
    hintCount: Math.min(room.settings.hints, Math.max(0, room.hintOrder.length - 1)),
    nextHintAt: room.phase === 'drawing' && room.hintsRevealed < Math.min(room.settings.hints, room.hintOrder.length - 1) ? hintTime(room, room.hintsRevealed + 1) : null,
    word: publicWord ? room.word : '', mask: Array.from(room.word).map((c, i) => /\s/.test(c) ? ' ' : hints.has(i) ? c : '_').join(''),
    choices: isDrawer && room.phase === 'choosing' ? room.choices : [],
    players: room.players.map(({ id, name, avatar, score, turnPoints = 0, connected, guessed }) => ({ id, name, avatar, score, turnPoints, connected, guessed })),
    voteKicks: (room.kickVotes ?? []).filter(v => v.expiresAt > now).map(v => ({ targetId: v.targetId, votes: v.voters.length, required: v.required, voted: v.voters.includes(playerId), eligible: v.eligible.includes(playerId), expiresAt: v.expiresAt })),
    messages: room.messages.filter(message => message.kind === 'correct') };
}
