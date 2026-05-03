// =======================================================================
// store.js — Firestore + localStorage 통합 데이터 모듈
// =======================================================================

import {
  doc, setDoc, getDoc, deleteDoc,
  collection, addDoc, getDocs, query, orderBy, limit,
  serverTimestamp, increment,
} from 'firebase/firestore';
import { db } from './config.js';

function gKey(uid, suffix) {
  return `omok-${uid}-${suffix}`;
}
function isGuest(user) {
  return user?.type === 'guest';
}

const DEFAULT_STATS = {
  aiTotal: 0, aiWins: 0, aiLosses: 0, aiDraws: 0,
  pvpTotal: 0, pvpWins: 0, pvpLosses: 0, pvpDraws: 0,
};
const DEFAULT_AI_STATS_BY_LEVEL = {
  1: { wins: 0, losses: 0, draws: 0 },
  2: { wins: 0, losses: 0, draws: 0 },
  3: { wins: 0, losses: 0, draws: 0 },
  4: { wins: 0, losses: 0, draws: 0 },
  5: { wins: 0, losses: 0, draws: 0 },
};

// ===== 가족 명단 =====
export async function listFamily(user) {
  if (isGuest(user)) {
    const raw = localStorage.getItem(gKey(user.uid, 'family'));
    return raw ? JSON.parse(raw) : [];
  }
  const ref = collection(db, 'users', user.uid, 'family');
  const snap = await getDocs(ref);
  const out = [];
  snap.forEach(d => out.push({ id: d.id, ...d.data() }));
  out.sort((a, b) => (a.createdAtMs || 0) - (b.createdAtMs || 0));
  return out;
}

export async function addFamily(user, name) {
  const trimmed = (name || '').trim();
  if (!trimmed) throw new Error('이름이 비어있습니다');
  if (trimmed.length > 20) throw new Error('이름은 20자 이내여야 합니다');

  if (isGuest(user)) {
    const list = await listFamily(user);
    if (list.length >= 20) throw new Error('가족은 최대 20명까지 등록 가능합니다');
    if (list.some(f => f.name === trimmed)) throw new Error('이미 등록된 이름입니다');
    const newItem = {
      id: 'fam-' + Math.random().toString(36).slice(2, 10),
      name: trimmed,
      createdAtMs: Date.now(),
    };
    list.push(newItem);
    localStorage.setItem(gKey(user.uid, 'family'), JSON.stringify(list));
    return newItem;
  }

  const ref = collection(db, 'users', user.uid, 'family');
  const existing = await getDocs(ref);
  if (existing.size >= 20) throw new Error('가족은 최대 20명까지 등록 가능합니다');
  let dup = false;
  existing.forEach(d => { if (d.data().name === trimmed) dup = true; });
  if (dup) throw new Error('이미 등록된 이름입니다');

  const docRef = await addDoc(ref, {
    name: trimmed,
    createdAtMs: Date.now(),
    createdAt: serverTimestamp(),
  });
  return { id: docRef.id, name: trimmed, createdAtMs: Date.now() };
}

export async function removeFamily(user, familyId) {
  if (isGuest(user)) {
    const list = await listFamily(user);
    const next = list.filter(f => f.id !== familyId);
    localStorage.setItem(gKey(user.uid, 'family'), JSON.stringify(next));
    return;
  }
  await deleteDoc(doc(db, 'users', user.uid, 'family', familyId));
}

// ===== 자동 이어하기 =====
export async function saveCurrentGame(user, state) {
  if (isGuest(user)) {
    localStorage.setItem(gKey(user.uid, 'current'), JSON.stringify(state));
    return;
  }
  await setDoc(doc(db, 'users', user.uid, 'currentGame', 'state'), {
    ...state,
    updatedAt: Date.now(),
  });
}

export async function loadCurrentGame(user) {
  if (isGuest(user)) {
    const raw = localStorage.getItem(gKey(user.uid, 'current'));
    return raw ? JSON.parse(raw) : null;
  }
  const snap = await getDoc(doc(db, 'users', user.uid, 'currentGame', 'state'));
  return snap.exists() ? snap.data() : null;
}

export async function clearCurrentGame(user) {
  if (isGuest(user)) {
    localStorage.removeItem(gKey(user.uid, 'current'));
    return;
  }
  await deleteDoc(doc(db, 'users', user.uid, 'currentGame', 'state'));
}

// ===== 게임 결과 저장 =====
export async function saveGameResult(user, gameRecord) {
  if (isGuest(user)) return saveGameResultGuest(user, gameRecord);
  const gamesRef = collection(db, 'users', user.uid, 'games');
  const newDoc = await addDoc(gamesRef, gameRecord);
  await applyStatsDelta(user, gameRecord, +1);
  return newDoc.id;
}

async function saveGameResultGuest(user, rec) {
  const listKey = gKey(user.uid, 'games');
  const raw = localStorage.getItem(listKey);
  const list = raw ? JSON.parse(raw) : [];
  const id = 'game-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  list.push({ id, ...rec });
  localStorage.setItem(listKey, JSON.stringify(list));
  applyStatsDeltaGuest(user, rec, +1);
  return id;
}

async function applyStatsDelta(user, rec, delta) {
  const userRef = doc(db, 'users', user.uid);
  const updates = {};
  if (rec.mode === 'pvc') {
    updates['stats.aiTotal'] = increment(delta);
    if (rec.winner === 'draw') updates['stats.aiDraws'] = increment(delta);
    else if (rec.userWon) updates['stats.aiWins'] = increment(delta);
    else updates['stats.aiLosses'] = increment(delta);
    if (rec.aiLevel) {
      const lv = rec.aiLevel;
      if (rec.winner === 'draw') updates[`aiStatsByLevel.${lv}.draws`] = increment(delta);
      else if (rec.userWon) updates[`aiStatsByLevel.${lv}.wins`] = increment(delta);
      else updates[`aiStatsByLevel.${lv}.losses`] = increment(delta);
    }
  } else if (rec.mode === 'pvp') {
    updates['stats.pvpTotal'] = increment(delta);
    if (rec.winner === 'draw') updates['stats.pvpDraws'] = increment(delta);
    else if (rec.winner === 'black') updates['stats.pvpWins'] = increment(delta);
    else updates['stats.pvpLosses'] = increment(delta);
  }
  await setDoc(userRef, updates, { merge: true });
}

function applyStatsDeltaGuest(user, rec, delta) {
  const key = gKey(user.uid, 'stats');
  const raw = localStorage.getItem(key);
  const stats = raw ? JSON.parse(raw) : {
    stats: { ...DEFAULT_STATS },
    aiStatsByLevel: JSON.parse(JSON.stringify(DEFAULT_AI_STATS_BY_LEVEL)),
  };
  if (rec.mode === 'pvc') {
    stats.stats.aiTotal = Math.max(0, (stats.stats.aiTotal || 0) + delta);
    if (rec.winner === 'draw') stats.stats.aiDraws = Math.max(0, (stats.stats.aiDraws || 0) + delta);
    else if (rec.userWon) stats.stats.aiWins = Math.max(0, (stats.stats.aiWins || 0) + delta);
    else stats.stats.aiLosses = Math.max(0, (stats.stats.aiLosses || 0) + delta);
    if (rec.aiLevel && stats.aiStatsByLevel[rec.aiLevel]) {
      const slot = stats.aiStatsByLevel[rec.aiLevel];
      if (rec.winner === 'draw') slot.draws = Math.max(0, (slot.draws || 0) + delta);
      else if (rec.userWon) slot.wins = Math.max(0, (slot.wins || 0) + delta);
      else slot.losses = Math.max(0, (slot.losses || 0) + delta);
    }
  } else if (rec.mode === 'pvp') {
    stats.stats.pvpTotal = Math.max(0, (stats.stats.pvpTotal || 0) + delta);
    if (rec.winner === 'draw') stats.stats.pvpDraws = Math.max(0, (stats.stats.pvpDraws || 0) + delta);
    else if (rec.winner === 'black') stats.stats.pvpWins = Math.max(0, (stats.stats.pvpWins || 0) + delta);
    else stats.stats.pvpLosses = Math.max(0, (stats.stats.pvpLosses || 0) + delta);
  }
  localStorage.setItem(key, JSON.stringify(stats));
}

// ===== 통계 / 게임 목록 읽기 =====
export async function loadStats(user) {
  if (isGuest(user)) {
    const raw = localStorage.getItem(gKey(user.uid, 'stats'));
    if (!raw) return { stats: { ...DEFAULT_STATS }, aiStatsByLevel: { ...DEFAULT_AI_STATS_BY_LEVEL } };
    return JSON.parse(raw);
  }
  const snap = await getDoc(doc(db, 'users', user.uid));
  if (!snap.exists()) return { stats: { ...DEFAULT_STATS }, aiStatsByLevel: { ...DEFAULT_AI_STATS_BY_LEVEL } };
  const data = snap.data();
  return {
    stats: { ...DEFAULT_STATS, ...(data.stats || {}) },
    aiStatsByLevel: { ...DEFAULT_AI_STATS_BY_LEVEL, ...(data.aiStatsByLevel || {}) },
  };
}

export async function listRecentGames(user, max = 50) {
  if (isGuest(user)) {
    const raw = localStorage.getItem(gKey(user.uid, 'games'));
    const list = raw ? JSON.parse(raw) : [];
    list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    return list.slice(0, max);
  }
  const ref = collection(db, 'users', user.uid, 'games');
  const q = query(ref, orderBy('timestamp', 'desc'), limit(max));
  const snap = await getDocs(q);
  const out = [];
  snap.forEach(d => out.push({ id: d.id, ...d.data() }));
  return out;
}

export async function loadFamilyStats(user) {
  const games = await listRecentGames(user, 1000);
  const map = new Map();
  for (const g of games) {
    if (g.mode !== 'pvp') continue;
    const blackId = g.blackLabel || 'anonymous';
    const blackName = g.blackLabelName || '익명';
    const whiteId = g.whiteLabel || 'anonymous';
    const whiteName = g.whiteLabelName || '익명';
    if (!map.has(blackId)) map.set(blackId, { id: blackId, name: blackName, wins: 0, losses: 0, draws: 0, total: 0 });
    if (!map.has(whiteId)) map.set(whiteId, { id: whiteId, name: whiteName, wins: 0, losses: 0, draws: 0, total: 0 });
    const blackEntry = map.get(blackId);
    const whiteEntry = map.get(whiteId);
    blackEntry.total++;
    whiteEntry.total++;
    if (g.winner === 'draw') {
      blackEntry.draws++;
      whiteEntry.draws++;
    } else if (g.winner === 'black') {
      blackEntry.wins++;
      whiteEntry.losses++;
    } else if (g.winner === 'white') {
      whiteEntry.wins++;
      blackEntry.losses++;
    }
  }
  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}

// ===== 삭제 기능 =====
export async function deleteGame(user, gameId) {
  if (isGuest(user)) {
    const listKey = gKey(user.uid, 'games');
    const raw = localStorage.getItem(listKey);
    const list = raw ? JSON.parse(raw) : [];
    const target = list.find(g => g.id === gameId);
    if (!target) return;
    const next = list.filter(g => g.id !== gameId);
    localStorage.setItem(listKey, JSON.stringify(next));
    applyStatsDeltaGuest(user, target, -1);
    return;
  }
  const ref = doc(db, 'users', user.uid, 'games', gameId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const rec = snap.data();
  await applyStatsDelta(user, rec, -1);
  await deleteDoc(ref);
}

export async function deleteGamesByLabel(user, labelId) {
  const games = await listRecentGames(user, 10000);
  const matches = games.filter(g =>
    g.mode === 'pvp' && (g.blackLabel === labelId || g.whiteLabel === labelId)
  );
  if (isGuest(user)) {
    const listKey = gKey(user.uid, 'games');
    const raw = localStorage.getItem(listKey);
    const list = raw ? JSON.parse(raw) : [];
    const matchIds = new Set(matches.map(m => m.id));
    const next = list.filter(g => !matchIds.has(g.id));
    localStorage.setItem(listKey, JSON.stringify(next));
    for (const m of matches) applyStatsDeltaGuest(user, m, -1);
    return matches.length;
  }
  for (const m of matches) {
    await applyStatsDelta(user, m, -1);
    await deleteDoc(doc(db, 'users', user.uid, 'games', m.id));
  }
  return matches.length;
}

export async function deleteAllGames(user) {
  if (isGuest(user)) {
    localStorage.removeItem(gKey(user.uid, 'games'));
    localStorage.removeItem(gKey(user.uid, 'stats'));
    return;
  }
  const games = await listRecentGames(user, 10000);
  for (const g of games) {
    await deleteDoc(doc(db, 'users', user.uid, 'games', g.id));
  }
  await setDoc(doc(db, 'users', user.uid), {
    stats: { ...DEFAULT_STATS },
    aiStatsByLevel: { ...DEFAULT_AI_STATS_BY_LEVEL },
  }, { merge: true });
}

export async function deleteAccount(user) {
  if (isGuest(user)) {
    const keys = ['family', 'games', 'stats', 'current'];
    for (const k of keys) localStorage.removeItem(gKey(user.uid, k));
    localStorage.removeItem('omok-guest-id');
    return;
  }
  const games = await listRecentGames(user, 10000);
  for (const g of games) {
    await deleteDoc(doc(db, 'users', user.uid, 'games', g.id));
  }
  const family = await listFamily(user);
  for (const f of family) {
    await deleteDoc(doc(db, 'users', user.uid, 'family', f.id));
  }
  await clearCurrentGame(user);
  await deleteDoc(doc(db, 'users', user.uid));
}
