import React from 'react';
import { EMPTY, BLACK } from '../game/gameLogic.js';

// SVG 내부 좌표는 고정. 실제 화면 크기는 CSS가 결정 (반응형).
const PADDING = 28;
const VIEW_BOX_SIZE = 700; // 내부 그리기 좌표계 (실제 px와 무관)

export default function Board({
  board, size, lastMove, winningLine, onCellClick,
  threats, forbiddenCells, hintCell, disabled,
}) {
  // 셀 사이즈도 viewBox 기준으로 계산
  const cellSize = Math.floor((VIEW_BOX_SIZE - PADDING * 2) / (size - 1));
  const innerSize = cellSize * (size - 1);
  const totalSize = innerSize + PADDING * 2;
  const xy = (i) => PADDING + i * cellSize;
  const starPoints = getStarPoints(size);

  return (
    <svg
      className="board-svg"
      width="100%"
      height="auto"
      viewBox={`0 0 ${totalSize} ${totalSize}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ display: 'block', maxWidth: '640px', width: '100%' }}
    >
      <defs>
        <radialGradient id="stoneBlack" cx="35%" cy="30%" r="65%">
          <stop offset="0%" stopColor="#5a5a5a" />
          <stop offset="60%" stopColor="#1a1a1a" />
          <stop offset="100%" stopColor="#000000" />
        </radialGradient>
        <radialGradient id="stoneWhite" cx="35%" cy="30%" r="65%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="60%" stopColor="#ececec" />
          <stop offset="100%" stopColor="#c8c8c8" />
        </radialGradient>
      </defs>

      <g>
        {Array.from({ length: size }).map((_, i) => (
          <line key={`h${i}`} x1={xy(0)} y1={xy(i)} x2={xy(size - 1)} y2={xy(i)} stroke="var(--board-line)" strokeWidth={1} />
        ))}
        {Array.from({ length: size }).map((_, i) => (
          <line key={`v${i}`} x1={xy(i)} y1={xy(0)} x2={xy(i)} y2={xy(size - 1)} stroke="var(--board-line)" strokeWidth={1} />
        ))}
      </g>

      <g>
        {starPoints.map(([sx, sy], i) => (
          <circle key={i} cx={xy(sx)} cy={xy(sy)} r={Math.max(2.5, cellSize * 0.07)} fill="var(--board-line)" />
        ))}
      </g>

      {forbiddenCells && forbiddenCells.map(({ x, y }, i) => (
        <g key={`forb-${i}`} className="threat-mark">
          <line x1={xy(x) - cellSize * 0.25} y1={xy(y) - cellSize * 0.25} x2={xy(x) + cellSize * 0.25} y2={xy(y) + cellSize * 0.25} stroke="var(--forbidden)" strokeWidth={2.5} strokeLinecap="round" />
          <line x1={xy(x) - cellSize * 0.25} y1={xy(y) + cellSize * 0.25} x2={xy(x) + cellSize * 0.25} y2={xy(y) - cellSize * 0.25} stroke="var(--forbidden)" strokeWidth={2.5} strokeLinecap="round" />
        </g>
      ))}

      {threats && (
        <g>
          {threats.openThrees.map(({ x, y }, i) => (
            <circle key={`t3-${i}`} className="threat-mark" cx={xy(x)} cy={xy(y)} r={cellSize * 0.18} fill="var(--threat-3)" />
          ))}
          {threats.doubleThreats.map(({ x, y }, i) => (
            <circle key={`td-${i}`} className="threat-mark" cx={xy(x)} cy={xy(y)} r={cellSize * 0.22} fill="var(--threat-double)" />
          ))}
          {threats.fours.map(({ x, y }, i) => (
            <circle key={`t4-${i}`} className="threat-mark" cx={xy(x)} cy={xy(y)} r={cellSize * 0.24} fill="var(--threat-4)" />
          ))}
        </g>
      )}

      <g>
        {board.map((row, y) =>
          row.map((cell, x) => {
            if (cell === EMPTY) return null;
            const fill = cell === BLACK ? 'url(#stoneBlack)' : 'url(#stoneWhite)';
            return (
              <circle key={`s-${x}-${y}`} className="stone" cx={xy(x)} cy={xy(y)} r={cellSize * 0.44} fill={fill} stroke="rgba(0,0,0,0.35)" strokeWidth={0.6} />
            );
          })
        )}
      </g>

      {lastMove && (
        <circle className="last-move-mark" cx={xy(lastMove.x)} cy={xy(lastMove.y)} r={cellSize * 0.14} fill="var(--last-mark)" />
      )}

      {winningLine && winningLine.length >= 2 && (
        <line x1={xy(winningLine[0].x)} y1={xy(winningLine[0].y)} x2={xy(winningLine[winningLine.length - 1].x)} y2={xy(winningLine[winningLine.length - 1].y)} stroke="var(--last-mark)" strokeWidth={4} strokeLinecap="round" opacity={0.6} />
      )}

      {hintCell && (
        <g className="hint-mark">
          <circle cx={xy(hintCell.x)} cy={xy(hintCell.y)} r={cellSize * 0.5} fill="none" stroke="var(--hint-glow)" strokeWidth={2.5} strokeDasharray="4 4" />
        </g>
      )}

      <g>
        {board.map((row, y) =>
          row.map((cell, x) => (
            <rect
              key={`c-${x}-${y}`}
              className="board-cell-hit"
              x={xy(x) - cellSize / 2}
              y={xy(y) - cellSize / 2}
              width={cellSize}
              height={cellSize}
              onClick={() => { if (disabled) return; if (cell !== EMPTY) return; onCellClick(x, y); }}
              onTouchEnd={(e) => {
                if (disabled) return;
                if (cell !== EMPTY) return;
                e.preventDefault();
                onCellClick(x, y);
              }}
            />
          ))
        )}
      </g>
    </svg>
  );
}

function getStarPoints(size) {
  const c = Math.floor(size / 2);
  if (size === 13) return [[3, 3], [9, 3], [3, 9], [9, 9], [c, c]];
  if (size === 15) return [[3, 3], [11, 3], [3, 11], [11, 11], [c, c]];
  if (size === 17) return [[3, 3], [13, 3], [3, 13], [13, 13], [c, c]];
  if (size === 19) return [[3, 3], [9, 3], [15, 3], [3, 9], [9, 9], [15, 9], [3, 15], [9, 15], [15, 15]];
  return [[c, c]];
}
