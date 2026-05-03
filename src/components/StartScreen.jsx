import React, { useState } from 'react';

export default function StartScreen({ onStart, onThemeChange, currentTheme }) {
  const [mode, setMode] = useState('pvp');
  const [boardSize, setBoardSize] = useState(15);
  const [renju, setRenju] = useState(false);
  const [allowOverline, setAllowOverline] = useState(true);
  const [undoLimit, setUndoLimit] = useState(1);
  const [hintEnabled, setHintEnabled] = useState(true);
  const [showThreats, setShowThreats] = useState(false);

  const handleStart = () => {
    onStart({ mode, boardSize, renju, allowOverline, undoLimit, hintEnabled, showThreats });
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
            <button className="choice-btn" disabled title="2단계에서 추가됩니다">컴퓨터 대전 (준비 중)</button>
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
            <button className={`choice-btn ${showThreats ? 'active' : ''}`} onClick={() => setShowThreats(true)}>표시</button>
            <button className={`choice-btn ${!showThreats ? 'active' : ''}`} onClick={() => setShowThreats(false)}>숨김</button>
          </div>
        </div>
      </div>

      <button className="primary-btn" onClick={handleStart} style={{ marginTop: 8 }}>대국 시작</button>
      <div className="footer">v0.1 · stage 1 · 2-player</div>
    </div>
  );
}
