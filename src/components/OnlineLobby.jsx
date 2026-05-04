import React, { useState } from 'react';
import { createRoom, joinRoom } from '../firebase/online.js';

export default function OnlineLobby({ user, onBack, onRoomCreated, onRoomJoined }) {
  const [view, setView] = useState('main');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const [boardSize, setBoardSize] = useState(15);
  const [renju, setRenju] = useState(false);
  const [allowOverline, setAllowOverline] = useState(true);
  const [hostColor, setHostColor] = useState('black');
  const [chatEnabled, setChatEnabled] = useState(false);
  const [emojiEnabled, setEmojiEnabled] = useState(true);
  const [timeLimit, setTimeLimit] = useState(0);

  const [joinCode, setJoinCode] = useState('');

  const handleCreateRoom = async () => {
    setBusy(true);
    setError(null);
    try {
      let actualHostColor = hostColor;
      if (hostColor === 'random') {
        actualHostColor = Math.random() < 0.5 ? 'black' : 'white';
      }
      const code = await createRoom({
        hostUid: user.uid,
        hostName: user.displayName || '익명',
        hostColor: actualHostColor,
        config: { boardSize, renju, allowOverline, chatEnabled, emojiEnabled, timeLimit },
      });
      onRoomCreated({ code, role: 'host', actualHostColor });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleJoinRoom = async () => {
    const code = joinCode.trim().toUpperCase();
    if (!code) {
      setError('코드를 입력해주세요.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await joinRoom({
        roomCode: code,
        guestUid: user.uid,
        guestName: user.displayName || '익명',
      });
      onRoomJoined({ code, role: result.role, rejoined: result.rejoined });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (view === 'main') {
    return (
      <div className="app-shell">
        <div className="title">
          <span>Omok</span>
          <span className="han">五目</span>
        </div>
        <div className="subtitle">— online · 온라인 대국 —</div>

        <div className="panel">
          <h2>온라인 대국</h2>
          <p style={{ fontSize: 13, color: 'var(--fg-muted)', lineHeight: 1.6, marginBottom: 20 }}>
            가족이나 친구와 다른 기기에서 실시간으로 대국할 수 있습니다.
            한쪽이 방을 만들어 코드를 받고, 다른 쪽이 그 코드로 입장하면 시작됩니다.
          </p>

          <button className="primary-btn" onClick={() => { setView('create'); setError(null); }}
            style={{ width: '100%', marginBottom: 12 }}>
            🎲 코드 발급받기 (방 만들기)
          </button>
          <button className="secondary-btn" onClick={() => { setView('join'); setError(null); }}
            style={{ width: '100%', padding: '12px 16px' }}>
            ✏️ 코드 쓰기 (방 입장)
          </button>
        </div>

        <button className="secondary-btn" onClick={onBack}>← 메뉴로</button>
        <div className="footer">online · v0.5</div>
      </div>
    );
  }

  if (view === 'create') {
    return (
      <div className="app-shell">
        <div className="title">
          <span>Omok</span>
          <span className="han">五目</span>
        </div>
        <div className="subtitle">— 방 만들기 —</div>

        <div className="panel">
          <h2>게임 설정</h2>
          <div className="option-row">
            <div><label>보드 크기</label><div className="hint-text">표준은 15 × 15</div></div>
            <div className="choice-group">
              {[13, 15, 17, 19].map(s => (
                <button key={s} className={`choice-btn ${boardSize === s ? 'active' : ''}`} onClick={() => setBoardSize(s)}>{s}×{s}</button>
              ))}
            </div>
          </div>
          <div className="option-row">
            <div><label>렌주 금수</label><div className="hint-text">흑에게 3-3 · 4-4 · 6목 금지</div></div>
            <div className="choice-group">
              <button className={`choice-btn ${!renju ? 'active' : ''}`} onClick={() => setRenju(false)}>자유 오목</button>
              <button className={`choice-btn ${renju ? 'active' : ''}`} onClick={() => setRenju(true)}>렌주</button>
            </div>
          </div>
          <div className="option-row">
            <div><label>6목 승리</label><div className="hint-text">렌주에서는 강제로 OFF</div></div>
            <div className="choice-group">
              <button className={`choice-btn ${allowOverline && !renju ? 'active' : ''}`} onClick={() => !renju && setAllowOverline(true)} disabled={renju}>인정</button>
              <button className={`choice-btn ${!allowOverline || renju ? 'active' : ''}`} onClick={() => setAllowOverline(false)}>5목만</button>
            </div>
          </div>
        </div>

        <div className="panel">
          <h2>내 색</h2>
          <div className="option-row" style={{ borderBottom: 'none' }}>
            <div><label>방 만든 사람의 색</label>
              <div className="hint-text">
                {hostColor === 'random' ? '코드 발급 시 자동으로 결정됨' : `상대는 자동으로 ${hostColor === 'black' ? '백' : '흑'}이 됩니다`}
              </div>
            </div>
            <div className="choice-group">
              <button className={`choice-btn ${hostColor === 'black' ? 'active' : ''}`} onClick={() => setHostColor('black')}>흑 (선공)</button>
              <button className={`choice-btn ${hostColor === 'white' ? 'active' : ''}`} onClick={() => setHostColor('white')}>백 (후공)</button>
              <button className={`choice-btn ${hostColor === 'random' ? 'active' : ''}`} onClick={() => setHostColor('random')}>무작위</button>
            </div>
          </div>
        </div>

        <div className="panel">
          <h2>채팅 / 시간</h2>
          <div className="option-row">
            <div><label>채팅</label><div className="hint-text">텍스트 메시지 사용 여부</div></div>
            <div className="choice-group">
              <button className={`choice-btn ${chatEnabled ? 'active' : ''}`} onClick={() => setChatEnabled(true)}>사용</button>
              <button className={`choice-btn ${!chatEnabled ? 'active' : ''}`} onClick={() => setChatEnabled(false)}>사용 안 함</button>
            </div>
          </div>
          <div className="option-row">
            <div><label>이모티콘</label><div className="hint-text">5가지 반응 이모티콘</div></div>
            <div className="choice-group">
              <button className={`choice-btn ${emojiEnabled ? 'active' : ''}`} onClick={() => setEmojiEnabled(true)}>사용</button>
              <button className={`choice-btn ${!emojiEnabled ? 'active' : ''}`} onClick={() => setEmojiEnabled(false)}>사용 안 함</button>
            </div>
          </div>
          <div className="option-row" style={{ borderBottom: 'none' }}>
            <div><label>한 수 시간 제한</label><div className="hint-text">시간 초과 시 그 수는 못 둠 (자동 패배 X)</div></div>
            <select
              value={timeLimit}
              onChange={(e) => setTimeLimit(parseInt(e.target.value, 10))}
              style={{
                padding: '6px 10px', fontSize: 13, borderRadius: 3,
                background: 'var(--bg-2)', color: 'var(--fg)',
                border: '1px solid var(--border)', fontFamily: 'inherit',
              }}
            >
              <option value={0}>없음</option>
              <option value={10}>10초</option>
              <option value={20}>20초</option>
              <option value={30}>30초</option>
            </select>
          </div>
        </div>

        {error && (
          <p style={{ fontSize: 13, color: '#e74c3c', textAlign: 'center', marginBottom: 12 }}>{error}</p>
        )}

        <button className="primary-btn" onClick={handleCreateRoom} disabled={busy}
          style={{ width: '100%', marginBottom: 12 }}>
          {busy ? '코드 발급 중…' : '코드 발급받기'}
        </button>
        <button className="secondary-btn" onClick={() => setView('main')} disabled={busy}>← 뒤로</button>
        <div className="footer">create · v0.5</div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="title">
        <span>Omok</span>
        <span className="han">五目</span>
      </div>
      <div className="subtitle">— 방 입장 —</div>

      <div className="panel">
        <h2>코드 입력</h2>
        <p style={{ fontSize: 13, color: 'var(--fg-muted)', lineHeight: 1.6, marginBottom: 16 }}>
          상대방에게 받은 6자리 코드를 입력하세요.
        </p>
        <input
          type="text"
          value={joinCode}
          onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => { if (e.key === 'Enter') handleJoinRoom(); }}
          placeholder="ABC123"
          maxLength={6}
          autoFocus
          style={{
            width: '100%', padding: '12px 16px', fontSize: 20,
            background: 'var(--bg-2)', color: 'var(--fg)',
            border: '1px solid var(--border)', borderRadius: 4,
            fontFamily: 'JetBrains Mono, monospace',
            letterSpacing: '0.3em', textAlign: 'center', textTransform: 'uppercase',
            marginBottom: 16, boxSizing: 'border-box',
          }}
        />
        {error && (
          <p style={{ fontSize: 13, color: '#e74c3c', marginBottom: 12 }}>{error}</p>
        )}

        <button className="primary-btn" onClick={handleJoinRoom} disabled={busy || !joinCode.trim()}
          style={{ width: '100%', marginBottom: 12 }}>
          {busy ? '입장 중…' : '입장하기'}
        </button>
      </div>

      <button className="secondary-btn" onClick={() => setView('main')} disabled={busy}>← 뒤로</button>
      <div className="footer">join · v0.5</div>
    </div>
  );
}
