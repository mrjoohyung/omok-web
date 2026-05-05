import React, { useState, useEffect } from 'react';
import LoginScreen from './components/LoginScreen.jsx';
import StartScreen from './components/StartScreen.jsx';
import GameScreen from './components/GameScreen.jsx';
import FamilyManagement from './components/FamilyManagement.jsx';
import AnalysisScreen from './components/AnalysisScreen.jsx';
import OnlineLobby from './components/OnlineLobby.jsx';
import OnlineRoom from './components/OnlineRoom.jsx';
import { watchAuthState, logout, clearGuestId } from './firebase/auth.js';
import { getGuestDataPreview, migrateGuestDataToAccount } from './firebase/store.js';

export default function App() {
  const [screen, setScreen] = useState('login');
  const [user, setUser] = useState(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [gameConfig, setGameConfig] = useState(null);
 const [resumeState, setResumeState] = useState(null);
  const [onlineRoom, setOnlineRoom] = useState(null);
  const [migrateInfo, setMigrateInfo] = useState(null);
  const [migrating, setMigrating] = useState(false);
  const [migrateResult, setMigrateResult] = useState(null);
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
        (async () => {
          try {
            const preview = await getGuestDataPreview();
            if (preview.hasData) {
              setMigrateInfo(preview);
            }
          } catch (e) { console.warn(e); }
        })();
      }
      setAuthChecking(false);
    });
    return unsub;
  }, []);

  const handleMigrate = async () => {
    if (!user) return;
    setMigrating(true);
    try {
      const result = await migrateGuestDataToAccount(user);
      setMigrateResult(result);
    } catch (e) {
      setMigrateResult({ error: e.message });
    } finally {
      setMigrating(false);
    }
  };

  const handleSkipMigrate = () => {
    setMigrateInfo(null);
  };

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

  if (migrateInfo && user && user.type === 'google') {
    return (
      <div className="app-shell">
        <div className="title">
          <span>Omok</span>
          <span className="han">五目</span>
        </div>
        <div className="subtitle">— 데이터 이전 —</div>
        <div className="panel">
          {!migrateResult ? (
            <>
              <h2>게스트 데이터 발견</h2>
              <p style={{ fontSize: 13, color: 'var(--fg)', lineHeight: 1.7, marginBottom: 14 }}>
                이 브라우저에 이전에 게스트 모드로 플레이한 데이터가 있습니다.
                <br/>
                현재 계정으로 합쳐서 가져올까요?
              </p>
              <div style={{ padding: 12, background: 'var(--bg-2)', borderRadius: 4, marginBottom: 14, fontSize: 13 }}>
                <div>📊 게임 기록: <b>{migrateInfo.totalGames}판</b></div>
                <div>👥 가족 명단: <b>{migrateInfo.totalFamily}명</b></div>
              </div>
              <p style={{ fontSize: 11, color: 'var(--fg-muted)', fontFamily: 'JetBrains Mono, monospace', marginBottom: 16 }}>
                ℹ 이전 후 게스트 데이터는 자동 삭제됩니다.
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="secondary-btn" onClick={handleSkipMigrate} disabled={migrating}>
                  나중에 (이번엔 무시)
                </button>
                <button className="primary-btn" onClick={handleMigrate} disabled={migrating} style={{ flex: 1 }}>
                  {migrating ? '이전 중…' : '내 계정으로 가져오기'}
                </button>
              </div>
            </>
          ) : (
            <>
              <h2>{migrateResult.error ? '이전 실패' : '이전 완료!'}</h2>
              {migrateResult.error ? (
                <p style={{ fontSize: 13, color: '#e74c3c' }}>{migrateResult.error}</p>
              ) : (
                <p style={{ fontSize: 13, lineHeight: 1.7 }}>
                  📊 게임 기록 <b>{migrateResult.migrated}판</b>이 이전되었습니다.
                  <br/>
                  👥 새 가족 <b>{migrateResult.families}명</b>이 추가되었습니다.
                </p>
              )}
              <div className="modal-actions">
                <button className="primary-btn" onClick={() => {
                  setMigrateInfo(null);
                  setMigrateResult(null);
                }}>
                  확인
                </button>
              </div>
            </>
          )}
        </div>
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

  if (screen === 'online-lobby') {
    return (
      <OnlineLobby
        user={user}
        onBack={() => setScreen('start')}
        onRoomCreated={({ code }) => {
          setOnlineRoom({ code, role: 'host' });
          setScreen('online-room');
        }}
        onRoomJoined={({ code, role }) => {
          setOnlineRoom({ code, role });
          setScreen('online-room');
        }}
      />
    );
  }

  if (screen === 'online-room' && onlineRoom) {
    return (
      <OnlineRoom
        roomCode={onlineRoom.code}
        role={onlineRoom.role}
        user={user}
        onExit={() => {
          setOnlineRoom(null);
          setScreen('start');
        }}
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
        onOpenOnline={() => setScreen('online-lobby')}
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
