import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import Board from './Board.jsx';
import {
  EMPTY, BLACK, WHITE, createBoard, cloneBoard, checkWin, isBoardFull,
  isForbidden, findThreatCells, coordLabel, summarizeMove,
} from '../game/gameLogic.js';
import { getHint } from '../game/hint.js';
import { chooseAIMove } from '../game/ai.js';

export default function GameScreen({ config, onExit }) {
  const {
    mode, boardSize, renju, allowOverline, undoLimit, hintEnabled, showThreats,
    aiLevel, aiStyle, userColor, practiceMode,
  } = config;

  const isAIMode = mode === 'pvc';
  const userColorVal = userColor === 'white' ? WHITE : BLACK;
  const aiColorVal = userColor === 'white' ? BLACK : WHITE;
  const overlineCheckOn = !allowOverline || renju;

  const [board, setBoard] = useState(() => createBoard(boardSize));
  const [history, setHistory] = useState([]);
  const [turn, setTurn] = useState(BLACK);
  const [winner, setWinner] = useState(null);
  const [winningLine, setWinningLine] = useState(null);
  const [winReason, setWinReason] = useState(null);
  const [undoUsed, setUndoUsed] = useState(() => isAIMode ? 0 : { [BLACK]: 0, [WHITE]: 0 });
  const [hintsLeft, setHintsLeft] = useState({ [BLACK]: 3, [WHITE]: 3 });
  const [hintCell, setHintCell] = useState(null);
  const [threatVisible, setThreatVisible] = useState(showThreats);
  const [aiThinking, setAiThinking] = useState(false);
  const [overlinePending, setOverlinePending] = useState(null);

  const aiTimerRef = useRef(null);
  const lastMove = history.length > 0 ? history[history.length - 1] : null;

  const forbiddenCells = useMemo(() => {
    if (!renju || winner) return null;
    if (turn !== BLACK) return null;
    if (isAIMode && !practiceMode) return null;
    const cells = [];
    for (let y = 0; y < boardSize; y++) {
      for (let x = 0; x < boardSize; x++) {
        if (board[y][x] !== EMPTY) continue;
        const f = isForbidden(board, x, y, BLACK);
        if (f.forbidden) cells.push({ x, y, reason: f.reason });
      }
    }
    return cells;
  }, [board, turn, renju, winner, boardSize, isAIMode, practiceMode]);

  const threatsForDisplay = useMemo(() => {
    if (!threatVisible || winner) return null;
    const opp = turn === BLACK ? WHITE : BLACK;
    return findThreatCells(board, opp);
  }, [board, threatVisible, turn, winner]);

  const placeStoneInternal = useCallback((curBoard, x, y, color) => {
    const next = cloneBoard(curBoard);
    next[y][x] = color;
    const win = checkWin(next, x, y, color, { allowOverline: renju ? false : allowOverline });
    setBoard(next);
    setHistory(h => [...h, { x, y, color }]);
    setHintCell(null);
    if (win.winner) {
      setWinner(win.winner);
      setWinningLine(win.line);
      setWinReason('five');
      return { ended: true };
    } else if (isBoardFull(next)) {
      setWinner('draw');
      setWinReason('draw');
      return { ended: true };
    }
    return { ended: false };
  }, [renju, allowOverline]);

  const handleUserClick = useCallback((x, y) => {
    if (winner) return;
    if (board[y][x] !== EMPTY) return;
    if (aiThinking) return;
    if (overlinePending) return;
    if (isAIMode && turn !== userColorVal) return;

    if (renju && turn === BLACK) {
      const f = isForbidden(board, x, y, BLACK);
      if (f.forbidden) {
        if (isAIMode && !practiceMode) {
          const next = cloneBoard(board);
          next[y][x] = BLACK;
          setBoard(next);
          setHistory(h => [...h, { x, y, color: BLACK }]);
          setWinner(WHITE);
          setWinReason('forbidden');
          return;
        } else {
          return;
        }
      }
    }

    if (overlineCheckOn && !(renju && turn === BLACK)) {
      const tmp = cloneBoard(board);
      tmp[y][x] = turn;
      const sum = summarizeMove(tmp, x, y, turn);
      if (sum.overline && !sum.exactlyFive) {
        setOverlinePending({ x, y, color: turn });
        return;
      }
    }

    const result = placeStoneInternal(board, x, y, turn);
    if (!result.ended) {
      setTurn(turn === BLACK ? WHITE : BLACK);
    }
  }, [board, turn, winner, renju, allowOverline, isAIMode, practiceMode, userColorVal,
      aiThinking, overlinePending, overlineCheckOn, placeStoneInternal]);

  const handleOverlineConfirmKeep = () => {
    if (!overlinePending) return;
    const { x, y, color } = overlinePending;
    setOverlinePending(null);
    const result = placeStoneInternal(board, x, y, color);
    if (!result.ended) {
      setTurn(color === BLACK ? WHITE : BLACK);
    }
  };

  const handleOverlineCancel = () => {
    setOverlinePending(null);
  };

  useEffect(() => {
    if (!isAIMode) return;
    if (winner) return;
    if (turn !== aiColorVal) return;
    if (aiThinking) return;
    if (overlinePending) return;

    setAiThinking(true);
    aiTimerRef.current = setTimeout(() => {
      try {
        const move = chooseAIMove(board, aiColorVal, {
          level: aiLevel, style: aiStyle, renju, allowOverline, timeLimit: 3000,
        });
        if (move) {
          const result = placeStoneInternal(board, move.x, move.y, aiColorVal);
          if (!result.ended) {
            setTurn(turn === BLACK ? WHITE : BLACK);
          }
        }
      } finally {
        setAiThinking(false);
      }
    }, 350);

    return () => { if (aiTimerRef.current) clearTimeout(aiTimerRef.current); };
  }, [turn, winner, isAIMode, aiColorVal, aiLevel, aiStyle, renju, allowOverline,
      board, aiThinking, overlinePending, placeStoneInternal]);

  let canUndo = false;
  let undoCountText = '';
  if (!winner && !aiThinking && history.length > 0 && !overlinePending) {
    if (isAIMode) {
      if (turn === userColorVal && history.length >= 1) {
        canUndo = (undoLimit === -1) || (undoUsed < undoLimit);
        undoCountText = undoLimit === -1 ? '' : `(${Math.max(0, undoLimit - undoUsed)}/${undoLimit})`;
      }
    } else {
      const lastColor = history[history.length - 1].color;
      const used = undoUsed[lastColor] ?? 0;
      canUndo = (undoLimit === -1) || (used < undoLimit);
      undoCountText = undoLimit === -1
        ? ''
        : `${lastColor === BLACK ? '흑' : '백'} ${Math.max(0, undoLimit - used)}/${undoLimit}`;
    }
  }

  const handleUndo = () => {
    if (!canUndo) return;
    if (isAIMode) {
      const stepsToUndo = Math.min(2, history.length);
      const newHistory = history.slice(0, history.length - stepsToUndo);
      const next = cloneBoard(board);
      for (let i = 0; i < stepsToUndo; i++) {
        const m = history[history.length - 1 - i];
        next[m.y][m.x] = EMPTY;
      }
      setBoard(next);
      setHistory(newHistory);
      setTurn(userColorVal);
      setHintCell(null);
      setUndoUsed(u => u + 1);
    } else {
      const newHistory = history.slice(0, -1);
      const removed = history[history.length - 1];
      const next = cloneBoard(board);
      next[removed.y][removed.x] = EMPTY;
      setBoard(next);
      setHistory(newHistory);
      setTurn(removed.color);
      setHintCell(null);
      setUndoUsed(u => ({ ...u, [removed.color]: (u[removed.color] ?? 0) + 1 }));
    }
  };

  const handleResign = () => {
    if (winner) return;
    if (aiThinking) return;
    if (overlinePending) return;
    const resignerName = isAIMode ? '내' : (turn === BLACK ? '흑' : '백');
    if (!confirm(`${resignerName}가 항복합니다. 정말 진행할까요?`)) return;
    if (isAIMode) setWinner(aiColorVal);
    else setWinner(turn === BLACK ? WHITE : BLACK);
    setWinReason('resign');
  };

  const canHint = !winner && !aiThinking && !overlinePending && hintsLeft[turn] > 0
    && (!isAIMode || turn === userColorVal);

  const handleHint = () => {
    if (!canHint) return;
    const cell = getHint(board, turn, { renju, allowOverline });
    if (!cell) return;
    setHintCell(cell);
    setHintsLeft(prev => ({ ...prev, [turn]: prev[turn] - 1 }));
  };

  const handleNewGame = () => {
    if (history.length > 0 && !winner) {
      if (!confirm('진행 중인 대국을 포기하고 새로 시작할까요?')) return;
    }
    if (aiTimerRef.current) clearTimeout(aiTimerRef.current);
    onExit();
  };

  const resultMessage = useMemo(() => {
    if (!winner) return null;
    if (winner === 'draw') return { title: '무승부', body: '보드가 가득 찼습니다.' };
    if (isAIMode) {
      const userWon = winner === userColorVal;
      const title = userWon ? '승리' : '패배';
      let body;
      if (winReason === 'resign') body = userWon ? 'AI가 항복했습니다.' : '항복하셨습니다.';
      else if (winReason === 'forbidden') body = '금수(렌주 위반)로 백 승리.';
      else body = userWon ? '5목 완성!' : 'AI가 5목을 완성했습니다.';
      return { title, body };
    }
    const winnerName = winner === BLACK ? '흑' : '백';
    if (winReason === 'resign') {
      const loserName = winner === BLACK ? '백' : '흑';
      return { title: `${winnerName} 승`, body: `${loserName}이 항복했습니다.` };
    }
    if (winReason === 'forbidden') return { title: `${winnerName} 승`, body: '상대가 금수를 두어 패배.' };
    return { title: `${winnerName} 승`, body: '5목 완성!' };
  }, [winner, winReason, isAIMode, userColorVal]);

  const userHintsLeft = isAIMode ? hintsLeft[userColorVal] : hintsLeft[turn];

  return (
    <div className="app-shell">
      <div className="game-shell">
        <TurnIndicator turn={turn} winner={winner} isAIMode={isAIMode} userColorVal={userColorVal} aiThinking={aiThinking} />
        <div className="board-wrap">
          <Board
            board={board} size={boardSize} lastMove={lastMove} winningLine={winningLine}
            onCellClick={handleUserClick} threats={threatsForDisplay}
            forbiddenCells={forbiddenCells} hintCell={hintCell}
            disabled={!!winner || aiThinking || !!overlinePending || (isAIMode && turn !== userColorVal)}
          />
        </div>
        <div className="controls">
          <button className="secondary-btn" onClick={handleUndo} disabled={!canUndo}>
            ↶ 무르기 {undoCountText}
          </button>
          <button className="secondary-btn" onClick={handleResign} disabled={!!winner || aiThinking || !!overlinePending}>⚑ 항복</button>
          {hintEnabled && (
            <button className="secondary-btn" onClick={handleHint} disabled={!canHint}>
              ◎ 힌트 ({isAIMode ? userHintsLeft : hintsLeft[turn]}/3)
            </button>
          )}
          {(!isAIMode || practiceMode) && (
            <button className="secondary-btn" onClick={() => setThreatVisible(v => !v)} disabled={!!winner}>
              {threatVisible ? '◉' : '○'} 위협 마커
            </button>
          )}
          <span className="meta">
            수 {history.length}{lastMove && ` · ${coordLabel(lastMove.x, lastMove.y, boardSize)}`}
            {isAIMode && ` · Lv${aiLevel}/${aiStyle === 'attack' ? '공격' : aiStyle === 'defense' ? '방어' : '균형'}/${practiceMode ? '연습' : '실전'}`}
          </span>
          <button className="secondary-btn" onClick={handleNewGame}>✕ 메뉴로</button>
        </div>
      </div>

      {overlinePending && (
        <div className="modal-backdrop">
          <div className="modal">
            <h3>6목 이상</h3>
            <p>
              그 자리에 두면 6목 이상이 되어 <b>승리로 인정되지 않는</b> 모드입니다.
              <br />그래도 두시겠어요?
            </p>
            <p style={{ fontSize: 12, color: 'var(--fg-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
              취소를 누르면 다른 자리에 두실 수 있습니다 (무르기 횟수 미차감).
            </p>
            <div className="modal-actions">
              <button className="secondary-btn" onClick={handleOverlineCancel}>취소</button>
              <button className="primary-btn" onClick={handleOverlineConfirmKeep}>그대로 두기</button>
            </div>
          </div>
        </div>
      )}

      {winner && resultMessage && (
        <div className="modal-backdrop">
          <div className="modal">
            <h3>{resultMessage.title}</h3>
            <p>{resultMessage.body}</p>
            <p style={{ fontSize: 12, color: 'var(--fg-muted)', fontFamily: 'JetBrains Mono, monospace' }}>총 {history.length}수</p>
            <div className="modal-actions">
              <button className="secondary-btn" onClick={onExit}>메뉴로</button>
              <button className="primary-btn" onClick={() => location.reload()}>다시 두기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TurnIndicator({ turn, winner, isAIMode, userColorVal, aiThinking }) {
  if (winner === 'draw') return (<div className="turn-indicator"><span className="winner-tag">무승부</span></div>);
  if (winner) {
    const isUserWin = isAIMode && winner === userColorVal;
    return (
      <div className="turn-indicator">
        <div className={`turn-stone ${winner === BLACK ? 'black' : 'white'}`} />
        <span>{isAIMode ? (isUserWin ? '내가 이김' : 'AI가 이김') : (winner === BLACK ? '흑 승' : '백 승')}</span>
        <span className="winner-tag">winner</span>
      </div>
    );
  }
  if (aiThinking) {
    return (
      <div className="turn-indicator">
        <div className={`turn-stone ${turn === BLACK ? 'black' : 'white'}`} />
        <span>AI 생각 중</span>
        <span className="winner-tag">…</span>
      </div>
    );
  }
  let label;
  if (isAIMode) {
    const isUserTurn = turn === userColorVal;
    label = isUserTurn ? `내 차례 (${turn === BLACK ? '흑' : '백'})` : `AI 차례 (${turn === BLACK ? '흑' : '백'})`;
  } else {
    label = turn === BLACK ? '흑 차례' : '백 차례';
  }
  return (
    <div className="turn-indicator">
      <div className={`turn-stone ${turn === BLACK ? 'black' : 'white'}`} />
      <span>{label}</span>
    </div>
  );
}
