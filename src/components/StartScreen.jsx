import React, { useState, useEffect } from 'react';
import { LEVEL_CONFIG } from '../game/ai.js';
import { listFamily, loadCurrentGame, listRecentGames, clearCurrentGame } from '../firebase/store.js';
import { computePlayerPattern, computeLevelRecommendation } from '../game/analytics.js';

export default function StartScreen({
  onStart, onThemeChange, currentTheme,
  user, onLogout, onOpenFamily, onOpenAnalysis, onOpenOnline, onResume,
}) {
  const [mode, setMode] = useState('pvp');
  const [boardSize, setBoardSize] = useState(15);
  const [renju, setRenju] = useState(false);
  const [allowOverline, setAllowOverline] = useState(true);

  const [undoLimit, setUndoLimit] = useState(1);
  const [timeLimit, setTimeLimit] = useState(0);
  const [hintEnabled, setHintEnabled] = useState(true);
  const [showThreatsPvp, setShowThreatsPvp] = useState(false);
  const [pvpRecordMode, setPvpRecordMode] = useState('guest');
  const [blackLabel, setBlackLabel] = useState('anonymous');
  const [whiteLabel, setWhiteLabel] = useState('anonymous');

 const [aiLevel, setAiLevel] = useState(3);
  const [aiStyle, setAiStyle] = useState('balanced');
  const [userColor, setUserColor] = useState('black');
  const [practiceMode, setPracticeMode] = useState(true);
  const [showThreatsPvc, setShowThreatsPvc] = useState(false);
  const [exploitMode, setExploitMode] = useState('normal'); // 'normal' | 'exploit'
  const [playerPattern, setPlayerPattern] = useState(null);
  const [levelRecommendation, setLevelRecommendation] = useState(null);
  const [allGamesForRec, setAllGamesForRec] = useState([]);

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
     try {
        const games = await listRecentGames(user, 1000);
        if (!mounted) return;
        setAllGamesForRec(games);
        const pattern = computePlayerPattern(games);
        setPlayerPattern(pattern);
      } catch (e) { console.warn('패턴 분석 로드 실패:', e); }
    })();
    return () => { mounted = false; };
  }, [user]);

  // AI 레벨 바뀌면 추천 재계산
  useEffect(() => {
    if (allGamesForRec.length === 0) {
      setLevelRecommendation(null);
      return;
    }
    const rec = computeLevelRecommendation(allGamesForRec, aiLevel);
    setLevelRecommendation(rec);
  }, [aiLevel, allGamesForRec]);

  // "나" 라벨은 항상 자동으로 추가됨 (가족 명단에 없어도)
  const meName = user?.displayName && user.type === 'google' ? user.displayName : '나';
  const labelOptions = [
    { id: 'self', name: meName + ' (나)' },
    ...familyList.map(f => ({ id: f.id, name: f.name })),
    { id: 'anonymous', name: '익명' },
  ];
  const labelMap = Object.fromEntries(labelOptions.map(o => [o.id, o.name]));
  const handleStart = () => {
    const config = { mode, boardSize, renju, allowOverline };
   if (mode === 'pvp') {
      config.undoLimit = undoLimit;
      config.hintEnabled = hintEnabled;
      config.showThreats = showThreatsPvp;
      config.timeLimit = timeLimit;
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
      config.userColor = userColor === 'random'
        ? (Math.random() < 0.5 ? 'black' : 'white')
        : userColor;
      config.practiceMode = practiceMode;
      config.undoLimit = practiceMode ? -1 : 1;
      config.hintEnabled = true;
      config.showThreats = practiceMode ? showThreatsPvc : false;
      // 약점 공략: 데이터 충분 + 사용자 선택 + Lv4 이상에서만 활성화
      const exploitActive = exploitMode === 'exploit'
        && playerPattern?.enoughData
        && aiLevel >= 4;
      config.exploitWeakness = exploitActive;
      if (exploitActive) {
        config.dirWeights = playerPattern.dirWeights;
        // Lv4 = 옵션 A (1.2), Lv5 = 옵션 B (1.5)
        config.weaknessStrength = aiLevel === 5 ? 1.5 : 1.2;
      }
    }
    onStart(config);
  };

  const handleResume = () => {
    if (!pendingResume) return;
    onResume(pendingResume);
  };

  const handleDiscardResume = async () => {
    if (!confirm('진행 중인 게임을 버리고 새로 시작할까요?')) return;
    try {
      await clearCurrentGame(user);
    } catch (e) {
      console.warn('진행 중 게임 삭제 실패:', e);
    }
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
            <div className="option-row">
              <div><label>한 수 시간 제한</label><div className="hint-text">시간 초과 시 그 수는 못 둠 (차례 넘김)</div></div>
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
          {levelRecommendation?.enoughData && (
            <div style={{
              padding: '10px 14px',
              background: 'var(--bg-2)',
              border: '1px solid var(--accent)',
              borderRadius: 3,
              marginBottom: 12,
              fontSize: 13,
              color: 'var(--fg)',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              flexWrap: 'wrap',
            }}>
              <span style={{ fontSize: 16 }}>💡</span>
              <span style={{ flex: 1, minWidth: 200, lineHeight: 1.5 }}>
                {levelRecommendation.reason}
              </span>
              {levelRecommendation.suggestion !== aiLevel && (
                <button
                  onClick={() => setAiLevel(levelRecommendation.suggestion)}
                  style={{
                    background: 'var(--accent)',
                    color: 'var(--bg)',
                    border: 'none',
                    padding: '6px 14px',
                    borderRadius: 3,
                    fontSize: 12,
                    fontFamily: 'JetBrains Mono, monospace',
                    letterSpacing: '0.06em',
                    cursor: 'pointer',
                  }}
                >
                  Lv{levelRecommendation.suggestion}로 변경
                </button>
              )}
            </div>
          )}
          <div className="option-row">
            <div><label>AI 플레이 스타일</label>
              <div className="hint-text">
                {aiStyle === 'attack' && '공격형: 자기 공격 라인 적극 연장'}
                {aiStyle === 'defense' && '방어형: 상대의 열린 2부터 견제'}
                {aiStyle === 'balanced' && '균형: 공격과 방어 균등'}
              </div>
            </div>
            <div className="option-row">
            <div><label>공략 방식</label>
              <div className="hint-text">
                {(() => {
                  if (exploitMode === 'normal') return '평범형: 균등하게 둠';
                  if (!playerPattern?.enoughData) {
                    return `약점공략형: 데이터 부족 (${playerPattern?.have || 0}/${playerPattern?.need || 20}판) → 평범형으로 진행`;
                  }
                  if (aiLevel < 4) return '약점공략형: Lv4 이상에서만 활성화 → 평범형으로 진행';
                  if (aiLevel === 5) return '약점공략형 (Lv5): 사용자 약한 방향 강하게 공격';
                  return '약점공략형 (Lv4): 사용자 약한 방향 살짝 더 공격';
                })()}
              </div>
            </div>
            <div className="choice-group">
              <button className={`choice-btn ${exploitMode === 'normal' ? 'active' : ''}`} onClick={() => setExploitMode('normal')}>평범형</button>
              <button className={`choice-btn ${exploitMode === 'exploit' ? 'active' : ''}`} onClick={() => setExploitMode('exploit')}>약점공략형</button>
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
              <button className={`choice-btn ${userColor === 'random' ? 'active' : ''}`} onClick={() => setUserColor('random')}>무작위</button>
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

      <button
        className="primary-btn"
        onClick={onOpenOnline}
        style={{
          marginTop: 12,
          width: '100%',
          padding: '20px 16px',
          fontSize: 16,
          background: 'var(--bg-2)',
          border: '2px solid var(--accent)',
          color: 'var(--fg)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <span style={{ fontSize: 28 }}>🌐</span>
        <span style={{ fontSize: 15, fontWeight: 600 }}>온라인 대국</span>
        <span style={{ fontSize: 11, color: 'var(--fg-muted)', fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.06em' }}>
          다른 기기와 실시간 연결
        </span>
      </button>

      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button className="secondary-btn" onClick={onOpenAnalysis}>📊 분석 / 전적</button>
        <button className="secondary-btn" onClick={onOpenFamily}>👥 가족 명단</button>
      </div>

      <div className="footer">v0.5 · stage 5 · online play</div>
    </div>
  );
}
