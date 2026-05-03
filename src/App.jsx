import React, { useState, useEffect } from 'react';
import LoginScreen from './components/LoginScreen.jsx';
import StartScreen from './components/StartScreen.jsx';
import GameScreen from './components/GameScreen.jsx';
import FamilyManagement from './components/FamilyManagement.jsx';
import AnalysisScreen from './components/AnalysisScreen.jsx';
import { watchAuthState, logout, clearGuestId } from './firebase/auth.js';

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

  const handleAccountDeleted = async () => {
    if (user?.type === 'google') {
      try { await logout(); } catch (e) { /* 무시 */ }
    } else if (user?.type === 'guest') {
      clearGuestId();
    }
    setUser(null);
    setGameConfig(null);
    setResumeState(null);
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
    return (
      <AnalysisScreen
        user={user}
        onBack={() => setScreen('start')}
        onAccountDeleted={handleAccountDeleted}
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
