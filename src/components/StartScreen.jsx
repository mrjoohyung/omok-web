import React, { useState } from 'react';
import { LEVEL_CONFIG } from '../game/ai.js';

export default function StartScreen({ onStart, onThemeChange, currentTheme }) {
  const [mode, setMode] = useState('pvp');
  const [boardSize, setBoardSize] = useState(15);
  const [renju, setRenju] = useState(false);
  const [allowOverline, setAllowOverline] = useState(true);

  const [undoLimit, setUndoLimit] = useState(1);
  const [hintEnabled, setHintEnabled] = useState(true);
  const [showThreatsPvp, setShowThreatsPvp] = useState(false);

  const [aiLevel, setAiLevel] = useState(3);
  const [aiStyle, setAiStyle] = useState('balanced');
  const [userColor, setUserColor] = useState('black');
  const [practiceMode, setPracticeMode] = useState(true);
  const [showThreatsPvc, setShowThreatsPvc] = useState(false);

  const handleStart = () => {
    const config = { mode, boardSize, renju, allowOverline };
    if (mode === 'pvp') {
      config.undoLimit = undoLimit;
      config.hintEnabled = hintEnabled;
      config.showThreats = showThreatsPvp;
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
          <div><label>6목 승리 인정</label><div className="hint-text">렌주에서는 강제로 OFF (장목 금수)</div></div>
          <div className="choice-group">
            <button className={`choice-btn ${allowOverline && !renju ? 'active' : ''}`} onClick={() => !renju && setAllowOverline(true)} disabled={renju}>인정 (6목+)</button>
            <button className={`choice-btn ${!allowOverline || renju ? 'active' : ''}`} onClick={() => setAllowOverline(false)}>정확히 5목만</button>
          </div>
        </div>
      </div>

      {mode === 'pvp' && (
        <div className="panel">
          <h2>2인용 설정</h2>
          <div className="option-row">
            <label>무르기 횟수</label>
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
      )}

      {mode === 'pvc' && (
        <div className="panel">
          <h2>컴퓨터 대전 설정</h2>
          <div className="option-row">
            <div><label>모드</label>
              <div className="hint-text">{practiceMode ? '연습: 무르기 무제한, 위협 마커 가능, 금수 자리 차단' : '실전: 무르기 1회, 위협 마커 없음, 금수 두면 즉시 패배'}</div>
            </div>
            <div className="choice-group">
              <button className={`choice-btn ${practiceMode ? 'active' : ''}`} onClick={() => setPracticeMode(true)}>연습</button>
              <button className={`choice-btn ${!practiceMode ? 'active' : ''}`} onClick={() => setPracticeMode(false)}>실전</button>
            </div>
          </div>
          <div className="option-row">
            <div><label>AI 레벨</label>
              <div className="hint-text">Lv{aiLevel} · {LEVEL_CONFIG[aiLevel]?.label}{aiLevel >= 4 ? ' · 강함' : ''}</div>
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
            <div><label>내 색</label><div className="hint-text">흑이 선공</div></div>
            <div className="choice-group">
              <button className={`choice-btn ${userColor === 'black' ? 'active' : ''}`} onClick={() => setUserColor('black')}>흑 (선공)</button>
              <button className={`choice-btn ${userColor === 'white' ? 'active' : ''}`} onClick={() => setUserColor('white')}>백 (후공)</button>
            </div>
          </div>
          {practiceMode && (
            <div className="option-row">
              <div><label>위협 마커 표시</label><div className="hint-text">연습 모드 전용</div></div>
              <div className="choice-group">
                <button className={`choice-btn ${showThreatsPvc ? 'active' : ''}`} onClick={() => setShowThreatsPvc(true)}>표시</button>
                <button className={`choice-btn ${!showThreatsPvc ? 'active' : ''}`} onClick={() => setShowThreatsPvc(false)}>숨김</button>
              </div>
            </div>
          )}
          <div className="option-row" style={{ borderBottom: 'none' }}>
            <div className="hint-text" style={{ fontSize: 11, lineHeight: 1.5 }}>
              💡 힌트는 항상 사용 가능 (게임당 3회). 실전 모드 통계는 추후 적응형 난이도에 반영됩니다 (3단계).
            </div>
          </div>
        </div>
      )}

      <button className="primary-btn" onClick={handleStart} style={{ marginTop: 8 }}>대국 시작</button>
      <div className="footer">v0.2 · stage 2 · ai opponent</div>
    </div>
  );
}
