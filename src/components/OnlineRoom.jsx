import React, { useState, useEffect } from 'react';
import { subscribeRoom, leaveRoom } from '../firebase/online.js';
import { listFamily, getOpponentLabelMap, setOpponentLabel } from '../firebase/store.js';
import OnlineGameScreen from './OnlineGameScreen.jsx';

export default function OnlineRoom({ roomCode, role, user, onExit }) {
  const [roomData, setRoomData] = useState(null);
  const [error, setError] = useState(null);
  const [familyList, setFamilyList] = useState([]);
  const [opponentLabelMap, setOpponentLabelMap] = useState({});
  const [labelChosen, setLabelChosen] = useState(false);
  const [showLabelModal, setShowLabelModal] = useState(false);
  const [pendingOpponentUid, setPendingOpponentUid] = useState(null);

  useEffect(() => {
    const unsub = subscribeRoom(roomCode, (data) => {
      if (!data) {
        setError('방이 사라졌거나 종료되었습니다.');
        setRoomData(null);
        return;
      }
      setRoomData(data);
    });
    return unsub;
  }, [roomCode]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [fam, oppMap] = await Promise.all([
          listFamily(user),
          getOpponentLabelMap(user),
        ]);
        if (!mounted) return;
        setFamilyList(fam);
        setOpponentLabelMap(oppMap);
      } catch (e) {
        console.warn('가족/매핑 로드 실패:', e);
      }
    })();
    return () => { mounted = false; };
  }, [user]);

  useEffect(() => {
    if (!roomData) return;
    if (labelChosen) return;
    if (roomData.status !== 'playing') return;

    const opponentUid = role === 'host' ? roomData.guestUid : roomData.hostUid;
    if (!opponentUid) return;

    if (opponentLabelMap[opponentUid]) {
      setLabelChosen(true);
      return;
    }

    setPendingOpponentUid(opponentUid);
    setShowLabelModal(true);
  }, [roomData, role, opponentLabelMap, labelChosen]);

  const handleLabelChosen = async (labelId) => {
    if (!pendingOpponentUid) return;
    try {
      await setOpponentLabel(user, pendingOpponentUid, labelId);
      setOpponentLabelMap(prev => ({ ...prev, [pendingOpponentUid]: labelId }));
    } catch (e) {
      console.warn('라벨 저장 실패:', e);
    }
    setShowLabelModal(false);
    setLabelChosen(true);
  };

  const handleLeave = async () => {
    if (!confirm('정말 방에서 나가시겠어요? 진행 중인 게임은 종료됩니다.')) return;
    try {
      await leaveRoom({ roomCode, role });
    } catch (e) { console.warn(e); }
    onExit();
  };

  if (error) {
    return (
      <div className="app-shell">
        <div className="title">
          <span>Omok</span>
          <span className="han">五目</span>
        </div>
        <div className="panel">
          <p style={{ fontSize: 14, color: '#e74c3c', textAlign: 'center', padding: 20 }}>
            {error}
          </p>
        </div>
        <button className="secondary-btn" onClick={onExit}>← 메뉴로</button>
      </div>
    );
  }

  if (!roomData) {
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

  if (roomData.status === 'waiting') {
    return (
      <div className="app-shell">
        <div className="title">
          <span>Omok</span>
          <span className="han">五目</span>
        </div>
        <div className="subtitle">— 상대를 기다리는 중 —</div>

        <div className="panel" style={{ textAlign: 'center', padding: '32px 24px' }}>
          <p style={{ fontSize: 13, color: 'var(--fg-muted)', marginBottom: 16 }}>
            아래 코드를 상대에게 알려주세요
          </p>
          <div style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 48,
            letterSpacing: '0.2em',
            color: 'var(--accent)',
            padding: '20px 0',
            fontWeight: 500,
          }}>
            {roomCode}
          </div>
          <button
            onClick={() => {
              navigator.clipboard?.writeText(roomCode);
              alert('코드가 복사되었습니다!');
            }}
            className="secondary-btn"
            style={{ marginBottom: 14 }}
          >
            📋 코드 복사
          </button>
          <p style={{ fontSize: 12, color: 'var(--fg-muted)', fontFamily: 'JetBrains Mono, monospace', marginTop: 16 }}>
            상대가 입장하면 자동으로 게임이 시작됩니다.
          </p>
          <p style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 8, lineHeight: 1.5 }}>
            내 색: <b style={{ color: 'var(--fg)' }}>{roomData.hostColor === 'black' ? '흑 (선공)' : '백 (후공)'}</b>
            <br/>
            보드: {roomData.config.boardSize}×{roomData.config.boardSize}
            {roomData.config.renju && ' · 렌주'}
            {!roomData.config.allowOverline && ' · 5목만'}
          </p>
        </div>

        <button className="secondary-btn" onClick={handleLeave}>방 닫기</button>
      </div>
    );
  }

  if (showLabelModal) {
    const opponentName = role === 'host' ? roomData.guestName : roomData.hostName;
    const labelOptions = [
      { id: 'anonymous', name: '익명' },
      ...familyList.map(f => ({ id: f.id, name: f.name })),
    ];
    return (
      <div className="app-shell">
        <div className="title">
          <span>Omok</span>
          <span className="han">五目</span>
        </div>
        <div className="subtitle">— 상대 라벨 정하기 —</div>

        <div className="panel">
          <h2>상대를 누구로 등록할까요?</h2>
          <p style={{ fontSize: 13, color: 'var(--fg-muted)', lineHeight: 1.6, marginBottom: 16 }}>
            "{opponentName}" 와 처음 대국합니다. 가족 명단에서 선택하면 통계가 그 사람과의 전적으로 누적됩니다.
            <br/>
            (다음에 같은 상대와 대국하면 이 라벨이 자동 적용됩니다.)
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {labelOptions.map(o => (
              <button
                key={o.id}
                onClick={() => handleLabelChosen(o.id)}
                style={{
                  padding: '12px 16px',
                  background: 'var(--bg-2)',
                  color: 'var(--fg)',
                  border: '1px solid var(--border)',
                  borderRadius: 3,
                  fontSize: 14,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  textAlign: 'left',
                }}
              >
                {o.name}
              </button>
            ))}
          </div>

          <p style={{ fontSize: 11, color: 'var(--fg-muted)', fontFamily: 'JetBrains Mono, monospace', marginTop: 16, lineHeight: 1.5 }}>
            ℹ 이 설정은 본인 계정에만 저장되며, 상대방은 본인을 별도로 라벨링합니다.
          </p>
        </div>
      </div>
    );
  }

  if (roomData.status === 'playing' || roomData.status === 'finished') {
    const opponentUid = role === 'host' ? roomData.guestUid : roomData.hostUid;
    const opponentLabelId = opponentLabelMap[opponentUid] || 'anonymous';
    const opponentLabelName = opponentLabelId === 'anonymous'
      ? '익명'
      : (familyList.find(f => f.id === opponentLabelId)?.name || '익명');

    return (
      <OnlineGameScreen
        roomCode={roomCode}
        role={role}
        user={user}
        roomData={roomData}
        opponentLabelId={opponentLabelId}
        opponentLabelName={opponentLabelName}
        onExit={onExit}
      />
    );
  }

  return (
    <div className="app-shell">
      <div className="title">
        <span>Omok</span>
        <span className="han">五目</span>
      </div>
      <div className="panel">
        <p style={{ fontSize: 14, color: 'var(--fg-muted)', textAlign: 'center', padding: 20 }}>
          상대가 방을 떠났거나 게임이 종료되었습니다.
        </p>
      </div>
      <button className="secondary-btn" onClick={onExit}>← 메뉴로</button>
    </div>
  );
}
