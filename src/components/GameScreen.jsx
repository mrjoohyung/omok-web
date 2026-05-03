import React, { useState, useMemo, useCallback } from 'react';
import Board from './Board.jsx';
import {
  EMPTY, BLACK, WHITE, createBoard, cloneBoard, checkWin, isBoardFull,
  isForbidden, findThreatCells, coordLabel,
} from '../game/gameLogic.js';
import { getHint } from '../game/hint.js';

export default function GameScreen({ config, onExit }) {
  const { boardSize, renju, allowOverline, undoLimit, hintEnabled, showThreats } = config;

  const [board, setBoard] = useState(() => createBoard(boardSize));
  const [history, setHistory] = useState([]);
  const [turn, setTurn] = useState(BLACK);
  const [winner, setWinner] = useState(null);
  const [winningLine, setWinningLine] = useState(null);
  const [winReason, setWinReason] = useState(null);
  const [undoUsed, setUndoUsed] = useState(0);
  const [hintsLeft, setHintsLeft] = useState({ [BLACK]: 3, [WHITE]: 3 });
  const [hintCell, setHintCell] = useState(null);
  const [threatVisible, setThreatVisible] = useState(showThreats);

  const lastMove = history.length > 0 ? history[history.length - 1] : null;

  const forbiddenCells = useMemo(() => {
    if (!renju || winner) return null;
    if (turn !== BLACK) return null;
    const cells = [];
    for (let y = 0; y < boardSize; y++) {
      for (let x = 0; x < boardSize; x++) {
        if (board[y][x] !== EMPTY) continue;
        const f = isForbidden(board, x, y, BLACK);
        if (f.forbidden) cells.push({ x, y, reason: f.reason });
      }
    }
    return cells;
  }, [board, turn, renju, winner, boardSize]);

  const threatsForDisplay = useMemo(() => {
    if (!threatVisible || winner) return null;
    const opp = turn === BLACK ? WHITE : BLACK;
    return findThreatCells(board, opp);
  }, [board, threatVisible, turn, winner]);

  const placeStone = useCallback((x, y) => {
    if (winner) return;
    if (board[y][x] !== EMPTY) return;
    if (renju && turn === BLACK) {
      const f = isForbidden(board, x, y, BLACK);
      if (f.forbidden) return;
    }
    const next = cloneBoard(board);
    next[y][x] = turn;
    const win = checkWin(next, x, y, turn, { allowOverline: renju ? false : allowOverline });
    setBoard(next);
    setHistory(h => [...h, { x, y, color: turn }]);
    setHintCell(null);
    if (win.winner) {
      setWinner(win.winner);
      setWinningLine(win.line);
      setWinReason('five');
    } else if (isBoardFull(next)) {
      setWinner('draw');
      setWinReason('draw');
    } else {
      setTurn(turn === BLACK ? WHITE : BLACK);
    }
  }, [board, turn, winner, renju, allowOverline]);

  const canUndo = !winner && history.length > 0 && (undoLimit === -1 || undoUsed < undoLimit);
  const handleUndo = () => {
    if (!canUndo) return;
    const newHistory = history.slice(0, -1);
    const removed = history[history.length - 1];
    const next = cloneBoard(board);
    next[removed.y][removed.x] = EMPTY;
    setBoard(next);
    setHistory(newHistory);
    setTurn(removed.color);
    setHintCell(null);
    setUndoUsed(u => u + 1);
  };

  const handleResign = () => {
    if (winner) return;
    if (!confirm(`${turn === BLACK ? '흑' : '백'}이 항복합니다. 정말 진행할까요?`)) return;
    setWinner(turn === BLACK ? WHITE : BLACK);
    setWinReason('resign');
  };

  const canHint = !winner && hintEnabled && hintsLeft[turn] > 0;
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
    onExit();
  };

  const resultMessage = useMemo(() => {
    if (!winner) return null;
    if (winner === 'draw') return { title: '무승부', body: '보드가 가득 찼습니다.' };
    const winnerName = winner === BLACK ? '흑' : '백';
    if (winReason === 'resign') {
      const loserName = winner === BLACK ? '백' : '흑';
      return { title: `${winnerName} 승`, body: `${loserName}이 항복했습니다.` };
    }
    return { title: `${winnerName} 승`, body: '5목 완성!' };
  }, [winner, winReason]);

  return (
    <div className="app-shell">
      <div className="game-shell">
        <TurnIndicator turn={turn} winner={winner} />
        <div className="board-wrap">
          <Board board={board} size={boardSize} lastMove={lastMove} winningLine={winningLine}
            onCellClick={placeStone} threats={threatsForDisplay} forbiddenCells={forbiddenCells}
            hintCell={hintCell} disabled={!!winner} />
        </div>
        <div className="controls">
          <button className="secondary-btn" onClick={handleUndo} disabled={!canUndo}>
            ↶ 무르기 {undoLimit !== -1 && `(${Math.max(0, undoLimit - undoUsed)}/${undoLimit})`}
          </button>
          <button className="secondary-btn" onClick={handleResign} disabled={!!winner}>⚑ 항복</button>
          {hintEnabled && (
            <button className="secondary-btn" onClick={handleHint} disabled={!canHint}>◎ 힌트 ({hintsLeft[turn]}/3)</button>
          )}
          <button className="secondary-btn" onClick={() => setThreatVisible(v => !v)} disabled={!!winner}>
            {threatVisible ? '◉' : '○'} 위협 마커
          </button>
          <span className="meta">수 {history.length}{lastMove && ` · ${coordLabel(lastMove.x, lastMove.y, boardSize)}`}</span>
          <button className="secondary-btn" onClick={handleNewGame}>✕ 메뉴로</button>
        </div>
      </div>
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

function TurnIndicator({ turn, winner }) {
  if (winner === 'draw') return (<div className="turn-indicator"><span className="winner-tag">무승부</span></div>);
  if (winner) return (
    <div className="turn-indicator">
      <div className={`turn-stone ${winner === BLACK ? 'black' : 'white'}`} />
      <span>{winner === BLACK ? '흑 승' : '백 승'}</span>
      <span className="winner-tag">winner</span>
    </div>
  );
  return (
    <div className="turn-indicator">
      <div className={`turn-stone ${turn === BLACK ? 'black' : 'white'}`} />
      <span>{turn === BLACK ? '흑 차례' : '백 차례'}</span>
    </div>
  );
}
