// =======================================================================
// online.js — 온라인 멀티플레이어 (Realtime Database)
// =======================================================================

import {
  ref, set, get, update, onValue, onDisconnect, serverTimestamp,
  push, runTransaction, off,
} from 'firebase/database';
import { rtdb } from './config.js';

export async function createRoom({ hostUid, hostName, hostColor, config }) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateRoomCode();
    const roomRef = ref(rtdb, `rooms/${code}`);
    const snap = await get(roomRef);
    if (snap.exists()) continue;

    const initial = {
      createdAt: serverTimestamp(),
      hostUid,
      hostName: hostName || '익명',
      hostColor: hostColor || 'black',
      guestUid: null,
      guestName: null,
      config,
     status: 'waiting',
      turn: 'black',
      turnStartedAt: null,
      moves: [],
      winner: null,
      winReason: null,
      winningLine: null,
      lastActiveHost: serverTimestamp(),
      lastActiveGuest: null,
      replayRequest: null,
      replayConfig: null,
    };
    await set(roomRef, initial);
    return code;
  }
  throw new Error('방 코드 발급 실패. 다시 시도해 주세요.');
}

function generateRoomCode() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export async function joinRoom({ roomCode, guestUid, guestName }) {
  const roomRef = ref(rtdb, `rooms/${roomCode}`);
  const snap = await get(roomRef);
  if (!snap.exists()) throw new Error('해당 코드의 방이 없습니다.');
  const data = snap.val();
  if (data.status === 'playing' || data.status === 'finished') {
    if (data.hostUid === guestUid || data.guestUid === guestUid) {
      return { rejoined: true, role: data.hostUid === guestUid ? 'host' : 'guest' };
    }
    throw new Error('이미 진행 중인 방입니다.');
  }
  if (data.status !== 'waiting') {
    throw new Error('이 방은 더 이상 입장할 수 없습니다.');
  }
  if (data.guestUid && data.guestUid !== guestUid) {
    throw new Error('이미 다른 게스트가 입장한 방입니다.');
  }

  const updates = {
    guestUid,
    guestName: guestName || '익명',
    status: 'playing',
    turnStartedAt: Date.now(),
    lastActiveGuest: serverTimestamp(),
  };
  await update(roomRef, updates);
  return { rejoined: false, role: 'guest' };
}

export function subscribeRoom(roomCode, callback) {
  const roomRef = ref(rtdb, `rooms/${roomCode}`);
  const handler = onValue(roomRef, (snap) => {
    callback(snap.exists() ? snap.val() : null);
  });
  return () => off(roomRef, 'value', handler);
}

export async function makeMove({ roomCode, x, y, color, expectedTurn }) {
  const roomRef = ref(rtdb, `rooms/${roomCode}`);
  const result = await runTransaction(roomRef, (data) => {
    if (!data) return data;
    if (data.status !== 'playing') return;
    if (data.turn !== expectedTurn) return;
    if (data.turn !== color) return;

    const existing = (data.moves || []).find(m => m.x === x && m.y === y);
    if (existing) return;

    data.moves = data.moves || [];
    data.moves.push({ x, y, color, ts: Date.now() });
    data.turn = color === 'black' ? 'white' : 'black';
    data.turnStartedAt = Date.now();
    if (color === 'black') data.lastActiveHost = Date.now();
    else data.lastActiveGuest = Date.now();
    return data;
  });
  return result.committed;
}

// ===== 시간 초과로 차례 넘김 =====
export async function passTurnOnTimeout({ roomCode, expectedTurn, expectedTurnStartedAt }) {
  const roomRef = ref(rtdb, `rooms/${roomCode}`);
  const result = await runTransaction(roomRef, (data) => {
    if (!data) return data;
    if (data.status !== 'playing') return;
    if (data.turn !== expectedTurn) return;
    if (data.turnStartedAt !== expectedTurnStartedAt) return;
    data.turn = expectedTurn === 'black' ? 'white' : 'black';
    data.turnStartedAt = Date.now();
    return data;
  });
  return result.committed;
}
export async function endGame({ roomCode, winner, winReason, winningLine }) {
  const roomRef = ref(rtdb, `rooms/${roomCode}`);
  await update(roomRef, {
    status: 'finished',
    winner,
    winReason,
    winningLine: winningLine || null,
  });
}

export async function resignGame({ roomCode, byColor }) {
  const winner = byColor === 'black' ? 'white' : 'black';
  await endGame({ roomCode, winner, winReason: 'resign', winningLine: null });
}

export async function updateHeartbeat({ roomCode, role }) {
  const field = role === 'host' ? 'lastActiveHost' : 'lastActiveGuest';
  const roomRef = ref(rtdb, `rooms/${roomCode}`);
  await update(roomRef, { [field]: serverTimestamp() });
}

export async function requestReplay({ roomCode, byUid, newConfig }) {
  const roomRef = ref(rtdb, `rooms/${roomCode}`);
  await update(roomRef, {
    replayRequest: { byUid, requestedAt: Date.now() },
    replayConfig: newConfig || null,
  });
}

export async function acceptReplay({ roomCode, hostColor, config }) {
  const roomRef = ref(rtdb, `rooms/${roomCode}`);
  await update(roomRef, {
    status: 'playing',
    turn: 'black',
    turnStartedAt: Date.now(),
    moves: [],
    winner: null,
    winReason: null,
    winningLine: null,
    hostColor,
    config,
    replayRequest: null,
    replayConfig: null,
    lastActiveHost: serverTimestamp(),
    lastActiveGuest: serverTimestamp(),
  });
}

export async function declineReplay({ roomCode }) {
  const roomRef = ref(rtdb, `rooms/${roomCode}`);
  await update(roomRef, {
    replayRequest: null,
    replayConfig: null,
    status: 'abandoned',
  });
}

// ===== 방 떠나기 / 폐기 =====
// 게임 진행 중이면 떠나는 사람의 상대를 승리로 처리
export async function leaveRoom({ roomCode, role }) {
  const roomRef = ref(rtdb, `rooms/${roomCode}`);
  await runTransaction(roomRef, (data) => {
    if (!data) return data;
    if (data.status === 'playing') {
      const leaverColor = role === 'host'
        ? data.hostColor
        : (data.hostColor === 'black' ? 'white' : 'black');
      const winnerColor = leaverColor === 'black' ? 'white' : 'black';
      data.status = 'finished';
      data.winner = winnerColor;
      data.winReason = 'leave';
      data.winningLine = null;
    } else if (data.status === 'waiting') {
      data.status = 'abandoned';
    }
    return data;
  });
}

export async function forceTerminate({ roomCode, byColor }) {
  const winner = byColor;
  await endGame({ roomCode, winner, winReason: 'timeout', winningLine: null });
}
// 양쪽 다 끊김 → 무승부 처리
export async function timeoutDraw({ roomCode }) {
  await endGame({ roomCode, winner: 'draw', winReason: 'timeout', winningLine: null });
}// =======================================================================
// 5-E1: 채팅 / 이모티콘
// =======================================================================

export async function sendChatMessage({ roomCode, senderUid, kind, content }) {
  const trimmed = (content || '').toString().slice(0, 100);
  if (!trimmed) return;
  const chatRef = ref(rtdb, `rooms/${roomCode}/chat`);
  await push(chatRef, {
    senderUid,
    kind,
    content: trimmed,
    ts: Date.now(),
  });
}
