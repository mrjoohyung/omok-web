// =======================================================================
// 인증 서비스: Google 로그인 + 게스트 모드 + 사용자 프로필
// =======================================================================

import {
  signInWithPopup, signOut, onAuthStateChanged,
} from 'firebase/auth';
import {
  doc, getDoc, setDoc, serverTimestamp,
} from 'firebase/firestore';
import { auth, db, googleProvider } from './config.js';

// ----- Google 로그인 -----
export async function loginWithGoogle() {
  const result = await signInWithPopup(auth, googleProvider);
  const user = result.user;
  await ensureUserProfile(user);
  return user;
}

// ----- 로그아웃 -----
export async function logout() {
  await signOut(auth);
}

// ----- 인증 상태 변화 구독 -----
export function watchAuthState(callback) {
  return onAuthStateChanged(auth, callback);
}

// ----- 사용자 프로필 보장 (없으면 생성) -----
async function ensureUserProfile(user) {
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      displayName: user.displayName || '익명',
      email: user.email || null,
      photoURL: user.photoURL || null,
      createdAt: serverTimestamp(),
      gamesPlayed: 0,
      stats: {
        wins: 0,
        losses: 0,
        draws: 0,
      },
    });
  }
}

// ----- 게스트 ID 관리 (localStorage) -----
const GUEST_KEY = 'omok-guest-id';

export function getOrCreateGuestId() {
  let id = localStorage.getItem(GUEST_KEY);
  if (!id) {
    id = 'guest-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    localStorage.setItem(GUEST_KEY, id);
  }
  return id;
}

export function clearGuestId() {
  localStorage.removeItem(GUEST_KEY);
}
