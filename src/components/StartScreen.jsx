import React, { useState, useEffect } from 'react';
import { LEVEL_CONFIG } from '../game/ai.js';
import { listFamily, loadCurrentGame } from '../firebase/store.js';

export default function StartScreen({
  onStart, onThemeChange, currentTheme,
  user, onLogout, onOpenFamily, onOpenAnalysis, onResume,
}) {
  const [mode, setMode] = useState('pvp');
  const [boardSize, setBoardSize] = useState(15);
  const [renju, setRenju] = useState(false);
  const [allowOverline, setAllowOverline] = useState(true);

  const [undoLimit, setUndoLimit] = useState(1);
  const [hintEnabled, setHintEnabled] = useState(true);
  const [showThreatsPvp, setShowThreatsPvp] = useState(false);
  const [pvpRecordMode, setPvpRecordMode] = useState('guest');
  const [blackLabel, setBlackLabel] = useState('self');
  const [blackLabel, setBlackLabel] = useState('self');
  const [whiteLabel, setWhiteLabel] = useState('anonymous');

  const [aiLevel, setAiLevel] = useState(3);
  const [aiStyle, setAiStyle] = useState('balanced');
  const [userColor, setUserColor] = useState('black');
  const [practiceMode, setPracticeMode] = useState(true);
  const [showThreatsPvc, setShowThreatsPvc] = useState(false);

  const [familyList, setFamilyList] = useState([]);
  const [pendingResume, setPendingResume] = useState(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!user) return;
      try {
        const list = await listFamily(user);
        if (mounted) setFamilyList(list);
      } catch (e) { console.warn('가족 명단 로드 실패:', e); }
      try {
        const cur = await loadCurrentGame(user);
        if (mounted && cur) setPendingResume(cur);
      } catch (e) { console.warn('진행 중 게임 확인 실패:', e); }
    })();
    return () => { mounted = false; };
  }, [user]);

  const labelOptions = [
    { id: 'anonymous', name: '익명' },
    ...familyList.map(f => ({ id: f.id, name: f.name })),
  ];
  const labelMap = Object.fromEntries(labelOptions.map(o => [o.id, o.name]));

  const handleStart = () => {
    const config = { mode, boardSize, renju, allowOverline };
    if (mode === 'pvp') {
      config.undoLimit = undoLimit;
      config.hintEnabled = hintEnabled;
      config.showThreats = showThreatsPvp;
      config.pvpRecordable = pvpRecordMode === 'tracked';
      if (pvpRecordMode === 'tracked') {
        config.blackLabel = blackLabel;
        config.whiteLabel = whiteLabel;
        config.blackLabelName = labelMap[blackLabel] || '익명';
        config.whiteLabelName = labelMap[whiteLabel] || '익명';
      }
    } else {
      config.aiLevel = aiLevel;
      config.aiStyle = aiStyle;
      config.userColor = userColor;
      config.practiceMode = practiceMode;
      config.undoLimit = practiceMode ? -1 : 1;
      config.hintEnabled = true;
      config.showThreats = practiceMode ? showThreatsPvc : false;
    }
    onStart(config);
  };

  const handleResume = () => {
    if (!pendingResume) return;
    onResume(pendingResume);
  };

  const handleDiscardResume = () => {
    if (!confirm('진행 중인 게임을 버리고 새로 시작할까요?')) return;
    setPendingResume(null);
  };

  return (
    <div className="app-shell">
      <div className="title">
        <span>Omok</span>
        <span className="han">五目</span>
      </div>
      <div className="subtitle">— gomoku · five in a row —</div>

      {user && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '8px 16px', background: 'var(--panel)',
          border: '1px solid var(--border)', borderRadius: 4,
          marginBottom: 14, fontSize: 13, maxWidth: 560, width: '100%',
        }}>
          {user.photoURL && (
            <img src={user.photoURL} alt="" style={{ width: 24, height: 24, borderRadius: '50%' }} />
          )}
          <span style={{ color: 'var(--fg)' }}>
            {user.displayName}
            {user.type === 'guest' && (
              <span style={{ fontSize: 11, color: 'var(--fg-muted)', marginLeft: 8, fontFamily: 'JetBrains Mono, monospace' }}>
                (게스트)
              </span>
            )}
          </span>
          <button
            onClick={onLogout}
            style={{
              marginLeft: 'auto', background: 'transparent',
              border: '1px solid var(--border)', color: 'var(--fg-muted)',
              fontSize: 11, padding: '4px 10px', borderRadius: 3,
              cursor: 'pointer', fontFamily: 'JetBrains Mono, monospace',
              letterSpacing: '0.08em', textTransform: 'uppercase',
            }}
          >
            {user.type === 'google' ? '로그아웃' : '로그인 화면으로'}
          </button>
        </div>
      )}

      {pendingResume && (
        <div className="panel" style={{ borderColor: 'var(--accent)' }}>
          <h2>진행 중인 대국</h2>
          <p style={{ fontSize: 13, color: 'var(--fg-muted)', marginBottom: 14 }}>
            저장된 게임이 있습니다. 이어서 두시겠어요?
            <br/>
            <span style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}>
              {pendingResume.config?.boardSize}×{pendingResume.config?.boardSize} · 수 {pendingResume.history?.length || 0}
            </span>
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="primary-btn" onClick={handleResume} style={{ fontSize: 14, padding: '8px 18px' }}>
              이어 두기
            </button>
            <button className="secondary-btn" onClick={handleDiscardResume}>버리기</button>
          </div>
        </div>
      )}

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
        <h2>모드 선택</h2>
        <div className="option-row">
          <label>대전 모드</label>
          <div className="choice-group">
            <button className={`choice-btn ${mode === 'pvp' ? 'active' : ''}`} onClick={() => setMode('pvp')}>2인용</button>
            <button className={`choice-btn ${mode === 'pvc' ? 'active' : ''}`} onClick={() => setMode('pvc')}>컴퓨터 대전</button>
          </div>
        </div>
      </div>

      <div className="panel">
        <h2>게임 규칙</h2>
        <div className="option-row">
          <div><label>보드 크기</label><div className="hint-text">표준은 15 × 15</div></div>
          <div className="choice-group">
            {[13, 15, 17, 19].map(s => (
              <button key={s} className={`choice-btn ${boardSize === s ? 'active' : ''}`} onClick={() => setBoardSize(s)}>{s}×{s}</button>
            ))}
          </div>
        </div>
        <div className="option-row">
          <div><label>렌주 금수 적용</label><div className="hint-text">흑에게 3-3 · 4-4 · 6목 금지</div></div>
          <div className="choice-group">
            <button className={`choice-btn ${!renju ? 'active' : ''}`} onClick={() => setRenju(false)}>자유 오목</button>
            <button className={`choice-btn ${renju ? 'active' : ''}`} onClick={() => setRenju(true)}>렌주 규칙</button>
          </div>
        </div>
        <div className="option-row">
          <div><label>6목 승리 인정</label><div className="hint-text">렌주에서는 강제로 OFF</div></div>
          <div className="choice-group">
            <button className={`choice-btn ${allowOverline && !renju ? 'active' : ''}`} onClick={() => !renju && setAllowOverline(true)} disabled={renju}>인정 (6목+)</button>
            <button className={`choice-btn ${!allowOverline || renju ? 'active' : ''}`} onClick={() => setAllowOverline(false)}>정확히 5목만</button>
          </div>
        </div>
      </div>

      {mode === 'pvp' && (
        <>
          <div className="panel">
            <h2>2인용 — 기록 방식</h2>
            <div className="option-row">
              <div><label>기록</label>
                <div className="hint-text">
                  {pvpRecordMode === 'guest'
                    ? '이 한 판은 통계에 반영하지 않습니다'
                    : '가족 라벨로 게임 기록 + 라벨별 전적 누적'}
                </div>
              </div>
              <div className="choice-group">
                <button className={`choice-btn ${pvpRecordMode === 'guest' ? 'active' : ''}`} onClick={() => setPvpRecordMode('guest')}>게스트 (기록 X)</button>
                <button className={`choice-btn ${pvpRecordMode === 'tracked' ? 'active' : ''}`} onClick={() => setPvpRecordMode('tracked')}>사용자 정보로</button>
              </div>
            </div>

            {pvpRecordMode === 'tracked' && (
              <>
                <div className="option-row">
                  <div><label>흑 (선공)</label></div>
                  <select
                    value={blackLabel}
                    onChange={(e) => setBlackLabel(e.target.value)}
                    style={{
                      padding: '6px 10px', fontSize: 13, borderRadius: 3,
                      background: 'var(--bg-2)', color: 'var(--fg)',
                      border: '1px solid var(--border)', fontFamily: 'inherit',
                    }}
                  >
                    {labelOptions.map(o => (
                      <option key={o.id} value={o.id}>{o.name}</option>
                    ))}
                  </select>
                </div>
                <div className="option-row">
                  <div><label>백 (후공)</label></div>
                  <select
                    value={whiteLabel}
                    onChange={(e) => setWhiteLabel(e.target.value)}
                    style={{
                      padding: '6px 10px', fontSize: 13, borderRadius: 3,
                      background: 'var(--bg-2)', color: 'var(--fg)',
                      border: '1px solid var(--border)', fontFamily: 'inherit',
                    }}
                  >
                    {labelOptions.map(o => (
                      <option key={o.id} value={o.id}>{o.name}</option>
                    ))}
                  </select>
                </div>
                <div className="option-row" style={{ borderBottom: 'none' }}>
                  <button className="secondary-btn" onClick={onOpenFamily} style={{ width: '100%' }}>
                    👥 가족 명단 관리
                  </button>
                </div>
                <div className="option-row" style={{ borderBottom: 'none', padding: '4px 0' }}>
                  <div className="hint-text" style={{ fontSize: 11, lineHeight: 1.5 }}>
                    ℹ 개인정보 보호를 위해 한 기기에서 한 게임 기록을 다른 계정에서 접근할 수 없습니다.
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="panel">
            <h2>2인용 옵션</h2>
            <div className="option-row">
              <div><label>무르기 횟수 (1인당)</label></div>
              <div className="choice-group">
                {[{ v: 0, l: '0회' }, { v: 1, l: '1회' }, { v: 3, l: '3회' }, { v: -1, l: '무제한' }].map(({ v, l }) => (
                  <button key={v} className={`choice-btn ${undoLimit === v ? 'active' : ''}`} onClick={() => setUndoLimit(v)}>{l}</button>
                ))}
              </div>
            </div>
            <div className="option-row">
              <div><label>힌트 사용</label><div className="hint-text">흑/백 각자 3회</div></div>
              <div className="choice-group">
                <button className={`choice-btn ${hintEnabled ? 'active' : ''}`} onClick={() => setHintEnabled(true)}>사용</button>
                <button className={`choice-btn ${!hintEnabled ? 'active' : ''}`} onClick={() => setHintEnabled(false)}>사용 안 함</button>
              </div>
            </div>
            <div className="option-row">
              <div><label>위협 마커 표시</label><div className="hint-text">상대가 만들 수 있는 3 / 3-3 / 4 자리</div></div>
              <div className="choice-group">
                <button className={`choice-btn ${showThreatsPvp ? 'active' : ''}`} onClick={() => setShowThreatsPvp(true)}>표시</button>
                <button className={`choice-btn ${!showThreatsPvp ? 'active' : ''}`} onClick={() => setShowThreatsPvp(false)}>숨김</button>
              </div>
            </div>
          </div>
        </>
      )}

      {mode === 'pvc' && (
        <div className="panel">
          <h2>컴퓨터 대전 설정</h2>
          <div className="option-row">
            <div><label>모드</label>
              <div className="hint-text">{practiceMode ? '연습: 무르기 무제한, 위협 마커 가능' : '실전: 무르기 1회, 통계 반영'}</div>
            </div>
            <div className="choice-group">
              <button className={`choice-btn ${practiceMode ? 'active' : ''}`} onClick={() => setPracticeMode(true)}>연습</button>
              <button className={`choice-btn ${!practiceMode ? 'active' : ''}`} onClick={() => setPracticeMode(false)}>실전</button>
            </div>
          </div>
          <div className="option-row">
            <div><label>AI 레벨</label>
              <div className="hint-text">Lv{aiLevel} · {LEVEL_CONFIG[aiLevel]?.label}</div>
            </div>
            <div className="choice-group">
              {[1, 2, 3, 4, 5].map(L => (
                <button key={L} className={`choice-btn ${aiLevel === L ? 'active' : ''}`} onClick={() => setAiLevel(L)}>Lv{L}</button>
              ))}
            </div>
          </div>
          <div className="option-row">
            <div><label>AI 플레이 스타일</label>
              <div className="hint-text">
                {aiStyle === 'attack' && '공격형: 자기 공격 라인 적극 연장'}
                {aiStyle === 'defense' && '방어형: 상대의 열린 2부터 견제'}
                {aiStyle === 'balanced' && '균형: 공격과 방어 균등'}
              </div>
            </div>
            <div className="choice-group">
              <button className={`choice-btn ${aiStyle === 'attack' ? 'active' : ''}`} onClick={() => setAiStyle('attack')}>공격형</button>
              <button className={`choice-btn ${aiStyle === 'defense' ? 'active' : ''}`} onClick={() => setAiStyle('defense')}>방어형</button>
              <button className={`choice-btn ${aiStyle === 'balanced' ? 'active' : ''}`} onClick={() => setAiStyle('balanced')}>균형</button>
            </div>
          </div>
          <div className="option-row">
            <div><label>내 색</label></div>
            <div className="choice-group">
              <button className={`choice-btn ${userColor === 'black' ? 'active' : ''}`} onClick={() => setUserColor('black')}>흑 (선공)</button>
              <button className={`choice-btn ${userColor === 'white' ? 'active' : ''}`} onClick={() => setUserColor('white')}>백 (후공)</button>
            </div>
          </div>
          {practiceMode && (
            <div className="option-row">
              <div><label>위협 마커 표시</label></div>
              <div className="choice-group">
                <button className={`choice-btn ${showThreatsPvc ? 'active' : ''}`} onClick={() => setShowThreatsPvc(true)}>표시</button>
                <button className={`choice-btn ${!showThreatsPvc ? 'active' : ''}`} onClick={() => setShowThreatsPvc(false)}>숨김</button>
              </div>
            </div>
          )}
        </div>
      )}

      <button className="primary-btn" onClick={handleStart} style={{ marginTop: 8 }}>대국 시작</button>

      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button className="secondary-btn" onClick={onOpenAnalysis}>📊 분석 / 전적</button>
        <button className="secondary-btn" onClick={onOpenFamily}>👥 가족 명단</button>
      </div>

      <div className="footer">v0.3 · stage 3 · cloud sync</div>
    </div>
  );
}
