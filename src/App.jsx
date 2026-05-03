import React, { useState, useEffect } from 'react';
import LoginScreen from './components/LoginScreen.jsx';
import StartScreen from './components/StartScreen.jsx';
import GameScreen from './components/GameScreen.jsx';
import FamilyManagement from './components/FamilyManagement.jsx';
import { watchAuthState, logout } from './firebase/auth.js';

export default function App() {
  const [screen, setScreen] = useState('login');
  const [user, setUser] = useState(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [gameConfig, setGameConfig] = useState(null);
  const [resumeState, setResumeState] = useState(null);
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('omok-theme') || 'classic';
  });

  useEffect(() => {
    document.body.dataset.theme = theme;
    localStorage.setItem('omok-theme', theme);
  }, [theme]);

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
      }
      setAuthChecking(false);
    });
    return unsub;
  }, []);

  const handleAuthSuccess = () => setScreen('start');

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
    setResumeState(null);
    setScreen('game');
  };

  const handleResume = (savedState) => {
    setGameConfig(savedState.config);
    setResumeState(savedState);
    setScreen('game');
  };

  const handleExitGame = () => {
    setGameConfig(null);
    setResumeState(null);
    setScreen('start');
  };

  const handleLogout = async () => {
    if (user?.type === 'google') await logout();
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

  if (screen === 'family') {
    return <FamilyManagement user={user} onBack={() => setScreen('start')} />;
  }

  if (screen === 'analysis') {
    return <AnalysisPlaceholder onBack={() => setScreen('start')} />;
  }

  if (screen === 'start') {
    return (
      <StartScreen
        onStart={handleStartGame}
        onThemeChange={setTheme}
        currentTheme={theme}
        user={user}
        onLogout={handleLogout}
        onOpenFamily={() => setScreen('family')}
        onOpenAnalysis={() => setScreen('analysis')}
        onResume={handleResume}
      />
    );
  }

  return (
    <GameScreen
      config={gameConfig}
      onExit={handleExitGame}
      user={user}
      resumeState={resumeState}
    />
  );
}

function AnalysisPlaceholder({ onBack }) {
  return (
    <div className="app-shell">
      <div className="title">
        <span>Omok</span>
        <span className="han">五目</span>
      </div>
      <div className="subtitle">— 분석 / 전적 —</div>
      <div className="panel">
        <h2>분석 / 전적</h2>
        <p style={{ fontSize: 14, color: 'var(--fg-muted)', lineHeight: 1.7 }}>
          이 화면은 다음 단계에서 정식으로 만들어집니다.
          <br />지금은 게임을 두시면 데이터가 백그라운드에 잘 쌓이고 있어요.
        </p>
      </div>
      <button className="secondary-btn" onClick={onBack}>← 메뉴로</button>
    </div>
  );
}
