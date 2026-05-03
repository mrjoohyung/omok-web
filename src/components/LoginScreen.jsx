import React, { useState } from 'react';
import { loginWithGoogle, getOrCreateGuestId } from '../firebase/auth.js';

export default function LoginScreen({ onAuthSuccess, onGuestStart, onThemeChange, currentTheme }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      const user = await loginWithGoogle();
      onAuthSuccess(user);
    } catch (e) {
      console.error(e);
      setError('로그인에 실패했습니다. 다시 시도해 주세요.');
    } finally {
      setLoading(false);
    }
  };

  const handleGuest = () => {
    const guestId = getOrCreateGuestId();
    onGuestStart(guestId);
  };

  return (
    <div className="app-shell">
      <div className="title">
        <span>Omok</span>
        <span className="han">五目</span>
      </div>
      <div className="subtitle">— gomoku · five in a row —</div>

      <div className="panel" style={{ paddingTop: 18, paddingBottom: 18 }}>
        <div className="option-row" style={{ borderBottom: 'none', padding: 0 }}>
          <label>시각 스타일</label>
          <div className="choice-group">
            <button className={`choice-btn ${currentTheme === 'classic' ? 'active' : ''}`} onClick={() => onThemeChange('classic')}>클래식 나무</button>
            <button className={`choice-btn ${currentTheme === 'light' ? 'active' : ''}`} onClick={() => onThemeChange('light')}>미니멀 라이트</button>
            <button className={`choice-btn ${currentTheme === 'dark' ? 'active' : ''}`} onClick={() => onThemeChange('dark')}>다크</button>
          </div>
        </div>
      </div>

      <div className="panel">
        <h2>시작하기</h2>
        <p style={{ fontSize: 14, color: 'var(--fg-muted)', lineHeight: 1.6, marginBottom: 20 }}>
          Google 계정으로 로그인하면 어느 기기에서든 같은 전적과 설정을 사용할 수 있습니다.
          간단히 둘러보고 싶으시면 게스트 모드로 시작하세요.
        </p>

        <button className="primary-btn" onClick={handleGoogleLogin} disabled={loading}
          style={{ width: '100%', marginBottom: 12 }}>
          {loading ? '로그인 중…' : 'Google로 로그인'}
        </button>

        <button className="secondary-btn" onClick={handleGuest} disabled={loading}
          style={{ width: '100%', padding: '12px 16px' }}>
          게스트로 시작
        </button>

        {error && (
          <p style={{ fontSize: 13, color: '#e74c3c', marginTop: 14, textAlign: 'center' }}>{error}</p>
        )}

        <div style={{ marginTop: 24, fontSize: 11, color: 'var(--fg-muted)', lineHeight: 1.5, fontFamily: 'JetBrains Mono, monospace' }}>
          ℹ 게스트 모드는 이 브라우저에서만 데이터가 유지됩니다.
          나중에 Google 로그인하시면 기존 게스트 데이터를 그대로 가져올 수 있습니다.
          <br/>
          ℹ 개인정보 보호를 위해, 한 기기에서 한 게임 기록을 다른 계정에서 접근할 수 없습니다.
        </div>
      </div>

      <div className="footer">v0.3 · stage 3 · cloud sync</div>
    </div>
  );
}
