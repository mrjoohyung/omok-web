// =======================================================================
// store.js — 흑백 분리 통계 버전
// =======================================================================

import {
  doc, setDoc, getDoc, deleteDoc,
  collection, addDoc, getDocs, query, orderBy, limit,
  serverTimestamp, increment,
} from 'firebase/firestore';
import { db } from './config.js';

function gKey(uid, suffix) { return `omok-${uid}-${suffix}`; }
function isGuest(user) { return user?.type === 'guest'; }

const EMPTY_COLOR_STATS = { wins: 0, losses: 0, draws: 0 };
const EMPTY_AI_STATS = {
  asBlack: { total: 0, wins: 0, losses: 0, draws: 0 },
  asWhite: { total: 0, wins: 0, losses: 0, draws: 0 },
};
const EMPTY_PVP_STATS = { total: 0, blackWins: 0, whiteWins: 0, draws: 0 };

const DEFAULT_STATS = {
  ai: JSON.parse(JSON.stringify(EMPTY_AI_STATS)),
  pvp: { ...EMPTY_PVP_STATS },
};

function emptyAiByLevel() {
  const out = {};
  for (let lv = 1; lv <= 5; lv++) {
    out[lv] = {
      asBlack: { ...EMPTY_COLOR_STATS },
      asWhite: { ...EMPTY_COLOR_STATS },
    };
  }
  return out;
}

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
    const colorKey = rec.userColor === 'white' ? 'asWhite' : 'asBlack';
    updates[`stats.ai.${colorKey}.total`] = increment(delta);
    if (rec.winner === 'draw') updates[`stats.ai.${colorKey}.draws`] = increment(delta);
    else if (rec.userWon) updates[`stats.ai.${colorKey}.wins`] = increment(delta);
    else updates[`stats.ai.${colorKey}.losses`] = increment(delta);

    if (rec.aiLevel) {
      const lv = rec.aiLevel;
      if (rec.winner === 'draw') updates[`aiStatsByLevel.${lv}.${colorKey}.draws`] = increment(delta);
      else if (rec.userWon) updates[`aiStatsByLevel.${lv}.${colorKey}.wins`] = increment(delta);
      else updates[`aiStatsByLevel.${lv}.${colorKey}.losses`] = increment(delta);
    }
  } else if (rec.mode === 'pvp') {
    updates['stats.pvp.total'] = increment(delta);
    if (rec.winner === 'draw') updates['stats.pvp.draws'] = increment(delta);
    else if (rec.winner === 'black') updates['stats.pvp.blackWins'] = increment(delta);
    else if (rec.winner === 'white') updates['stats.pvp.whiteWins'] = increment(delta);
  }

  await setDoc(userRef, updates, { merge: true });
}

function applyStatsDeltaGuest(user, rec, delta) {
  const key = gKey(user.uid, 'stats');
  const raw = localStorage.getItem(key);
  const stats = raw ? JSON.parse(raw) : {
    stats: JSON.parse(JSON.stringify(DEFAULT_STATS)),
    aiStatsByLevel: emptyAiByLevel(),
  };

  if (!stats.stats) stats.stats = JSON.parse(JSON.stringify(DEFAULT_STATS));
  if (!stats.stats.ai) stats.stats.ai = JSON.parse(JSON.stringify(EMPTY_AI_STATS));
  if (!stats.stats.pvp) stats.stats.pvp = { ...EMPTY_PVP_STATS };
  if (!stats.aiStatsByLevel) stats.aiStatsByLevel = emptyAiByLevel();

  const clamp = (v) => Math.max(0, v);

  if (rec.mode === 'pvc') {
    const colorKey = rec.userColor === 'white' ? 'asWhite' : 'asBlack';
    const slot = stats.stats.ai[colorKey];
    slot.total = clamp((slot.total || 0) + delta);
    if (rec.winner === 'draw') slot.draws = clamp((slot.draws || 0) + delta);
    else if (rec.userWon) slot.wins = clamp((slot.wins || 0) + delta);
    else slot.losses = clamp((slot.losses || 0) + delta);

    if (rec.aiLevel) {
      if (!stats.aiStatsByLevel[rec.aiLevel]) {
        stats.aiStatsByLevel[rec.aiLevel] = { asBlack: { ...EMPTY_COLOR_STATS }, asWhite: { ...EMPTY_COLOR_STATS } };
      }
      if (!stats.aiStatsByLevel[rec.aiLevel][colorKey]) {
        stats.aiStatsByLevel[rec.aiLevel][colorKey] = { ...EMPTY_COLOR_STATS };
      }
      const lvSlot = stats.aiStatsByLevel[rec.aiLevel][colorKey];
      if (rec.winner === 'draw') lvSlot.draws = clamp((lvSlot.draws || 0) + delta);
      else if (rec.userWon) lvSlot.wins = clamp((lvSlot.wins || 0) + delta);
      else lvSlot.losses = clamp((lvSlot.losses || 0) + delta);
    }
  } else if (rec.mode === 'pvp') {
    const p = stats.stats.pvp;
    p.total = clamp((p.total || 0) + delta);
    if (rec.winner === 'draw') p.draws = clamp((p.draws || 0) + delta);
    else if (rec.winner === 'black') p.blackWins = clamp((p.blackWins || 0) + delta);
    else if (rec.winner === 'white') p.whiteWins = clamp((p.whiteWins || 0) + delta);
  }

  localStorage.setItem(key, JSON.stringify(stats));
}

// ===== 통계 / 게임 목록 읽기 =====
export async function loadStats(user) {
  if (isGuest(user)) {
    const raw = localStorage.getItem(gKey(user.uid, 'stats'));
    if (!raw) return {
      stats: JSON.parse(JSON.stringify(DEFAULT_STATS)),
      aiStatsByLevel: emptyAiByLevel(),
    };
    const parsed = JSON.parse(raw);
    return {
      stats: {
        ai: parsed.stats?.ai || JSON.parse(JSON.stringify(EMPTY_AI_STATS)),
        pvp: parsed.stats?.pvp || { ...EMPTY_PVP_STATS },
      },
      aiStatsByLevel: parsed.aiStatsByLevel || emptyAiByLevel(),
    };
  }
  const snap = await getDoc(doc(db, 'users', user.uid));
  if (!snap.exists()) return {
    stats: JSON.parse(JSON.stringify(DEFAULT_STATS)),
    aiStatsByLevel: emptyAiByLevel(),
  };
  const data = snap.data();
  return {
    stats: {
      ai: data.stats?.ai || JSON.parse(JSON.stringify(EMPTY_AI_STATS)),
      pvp: data.stats?.pvp || { ...EMPTY_PVP_STATS },
    },
    aiStatsByLevel: data.aiStatsByLevel || emptyAiByLevel(),
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

  function ensure(id, name) {
    if (!map.has(id)) {
      map.set(id, {
        id, name,
        total: 0,
        asBlack: { wins: 0, losses: 0, draws: 0, total: 0 },
        asWhite: { wins: 0, losses: 0, draws: 0, total: 0 },
      });
    }
    return map.get(id);
  }

  for (const g of games) {
    if (g.mode !== 'pvp') continue;
    const blackId = g.blackLabel || 'anonymous';
    const blackName = g.blackLabelName || '익명';
    const whiteId = g.whiteLabel || 'anonymous';
    const whiteName = g.whiteLabelName || '익명';

    const blackEntry = ensure(blackId, blackName);
    const whiteEntry = ensure(whiteId, whiteName);
    blackEntry.total++;
    whiteEntry.total++;
    blackEntry.asBlack.total++;
    whiteEntry.asWhite.total++;

    if (g.winner === 'draw') {
      blackEntry.asBlack.draws++;
      whiteEntry.asWhite.draws++;
    } else if (g.winner === 'black') {
      blackEntry.asBlack.wins++;
      whiteEntry.asWhite.losses++;
    } else if (g.winner === 'white') {
      blackEntry.asBlack.losses++;
      whiteEntry.asWhite.wins++;
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
    stats: JSON.parse(JSON.stringify(DEFAULT_STATS)),
    aiStatsByLevel: emptyAiByLevel(),
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
// =======================================================================
// 온라인 대국 - 상대 라벨 매핑 (uid → 가족 라벨 ID)
// =======================================================================
export async function getOpponentLabelMap(user) {
  if (isGuest(user)) {
    const raw = localStorage.getItem(gKey(user.uid, 'oppmap'));
    return raw ? JSON.parse(raw) : {};
  }
  const snap = await getDoc(doc(db, 'users', user.uid));
  if (!snap.exists()) return {};
  return snap.data().opponentLabels || {};
}

export async function setOpponentLabel(user, opponentUid, labelId) {
  if (isGuest(user)) {
    const map = await getOpponentLabelMap(user);
    map[opponentUid] = labelId;
    localStorage.setItem(gKey(user.uid, 'oppmap'), JSON.stringify(map));
    return;
  }
  await setDoc(doc(db, 'users', user.uid), {
    [`opponentLabels.${opponentUid}`]: labelId,
  }, { merge: true });
}
