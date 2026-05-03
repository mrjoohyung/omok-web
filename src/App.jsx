// =======================================================================
// App.jsx — 화면 라우팅 + 인증 상태 관리
// =======================================================================
// 화면 흐름: 로그인 → 메뉴 → 게임
// 게스트 모드도 "로그인된 것처럼" 취급 (단, Firebase 인증은 안 됨)
// =======================================================================

import React, { useState, useEffect } from 'react';
import LoginScreen from './components/LoginScreen.jsx';
import StartScreen from './components/StartScreen.jsx';
import GameScreen from './components/GameScreen.jsx';
import { watchAuthState, logout, getOrCreateGuestId } from './firebase/auth.js';

export default function App() {
  // 'login' | 'start' | 'game'
  const [screen, setScreen] = useState('login');
  // user: { type: 'google'|'guest', uid, displayName, photoURL }
  const [user, setUser] = useState(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [gameConfig, setGameConfig] = useState(null);
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('omok-theme') || 'classic';
  });

  useEffect(() => {
    document.body.dataset.theme = theme;
    localStorage.setItem('omok-theme', theme);
  }, [theme]);

  // Firebase 인증 상태 구독
  useEffect(() => {
    const unsub = watchAuthState((firebaseUser) => {
      if (firebaseUser) {
        setUser({
          type: 'google',
          uid: firebaseUser.uid,
          displayName: firebaseUser.displayName || '익명',
          photoURL: firebaseUser.photoURL || null,
          email: firebaseUser.email || null,
        });
        setScreen((s) => (s === 'login' ? 'start' : s));
      } else {
        // 로그인 안 됨 — 화면 결정은 다른 데서
      }
      setAuthChecking(false);
    });
    return unsub;
  }, []);

  const handleAuthSuccess = (firebaseUser) => {
    // watchAuthState가 이미 user를 설정함. 그냥 화면만 이동
    setScreen('start');
  };

  const handleGuestStart = (guestId) => {
    setUser({
      type: 'guest',
      uid: guestId,
      displayName: '게스트',
      photoURL: null,
    });
    setScreen('start');
  };

  const handleStartGame = (config) => {
    setGameConfig(config);
    setScreen('game');
  };

  const handleExitGame = () => {
    setGameConfig(null);
    setScreen('start');
  };

  const handleLogout = async () => {
    if (user?.type === 'google') {
      await logout();
    }
    setUser(null);
    setScreen('login');
  };

  if (authChecking) {
    return (
      <div className="app-shell">
        <div className="title">
          <span>Omok</span>
          <span className="han">五目</span>
        </div>
        <div className="subtitle">로딩 중…</div>
      </div>
    );
  }

  if (screen === 'login') {
    return (
      <LoginScreen
        onAuthSuccess={handleAuthSuccess}
        onGuestStart={handleGuestStart}
        onThemeChange={setTheme}
        currentTheme={theme}
      />
    );
  }

  if (screen === 'start') {
    return (
      <StartScreen
        onStart={handleStartGame}
        onThemeChange={setTheme}
        currentTheme={theme}
        user={user}
        onLogout={handleLogout}
      />
    );
  }

  return <GameScreen config={gameConfig} onExit={handleExitGame} user={user} />;
}
