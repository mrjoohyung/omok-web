import React from 'react';
import { EMPTY, BLACK } from '../game/gameLogic.js';

const PADDING = 28;
const MAX_BOARD_PX = 640;

export default function Board({
  board, size, lastMove, winningLine, onCellClick,
  threats, forbiddenCells, hintCell, disabled,
}) {
  const cellSize = Math.floor((MAX_BOARD_PX - PADDING * 2) / (size - 1));
  const innerSize = cellSize * (size - 1);
  const totalSize = innerSize + PADDING * 2;
  const xy = (i) => PADDING + i * cellSize;
  const starPoints = getStarPoints(size);

  return (
    <svg className="board-svg" width={totalSize} height={totalSize} viewBox={`0 0 ${totalSize} ${totalSize}`}>
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
            const fill = cell === BLACK ? 'var(--stone-black)' : 'var(--stone-white)';
            return (
              <circle key={`s-${x}-${y}`} className="stone" cx={xy(x)} cy={xy(y)} r={cellSize * 0.44} fill={fill} stroke="rgba(0,0,0,0.25)" strokeWidth={0.5} />
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
            <rect key={`c-${x}-${y}`} className="board-cell-hit" x={xy(x) - cellSize / 2} y={xy(y) - cellSize / 2} width={cellSize} height={cellSize}
              onClick={() => { if (disabled) return; if (cell !== EMPTY) return; onCellClick(x, y); }} />
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
