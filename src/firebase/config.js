// =======================================================================
// Firebase 설정 + 초기화
// =======================================================================
// API 키는 비밀이 아닙니다 (보안은 Firestore Rules가 담당).

import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCuDAWiWsgjuboR9FPx2TJOIn59uscd5BQ",
  authDomain: "omok-web-eddcc.firebaseapp.com",
  projectId: "omok-web-eddcc",
  storageBucket: "omok-web-eddcc.firebasestorage.app",
  messagingSenderId: "284989009921",
  appId: "1:284989009921:web:f91335f8d47d9bbfde1000"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
