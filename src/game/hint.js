import {
  EMPTY, BLACK, WHITE, cloneBoard, summarizeMove, isForbidden,
} from './gameLogic.js';

function candidateCells(board) {
  const size = board.length;
  const seen = new Set();
  const out = [];
  let hasAny = false;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (board[y][x] !== EMPTY) {
        hasAny = true;
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
            if (board[ny][nx] !== EMPTY) continue;
            const key = ny * size + nx;
            if (seen.has(key)) continue;
            seen.add(key);
            out.push({ x: nx, y: ny });
          }
        }
      }
    }
  }
  if (!hasAny) {
    const c = Math.floor(size / 2);
    return [{ x: c, y: c }];
  }
  return out;
}

function scoreCell(board, x, y, color, options) {
  const opp = color === BLACK ? WHITE : BLACK;
  const myBoard = cloneBoard(board);
  myBoard[y][x] = color;
  const mySum = summarizeMove(myBoard, x, y, color);
  if (options.allowOverline) { if (mySum.five) return 1_000_000; }
  else { if (mySum.exactlyFive) return 1_000_000; }

  const oppBoard = cloneBoard(board);
  oppBoard[y][x] = opp;
  const oppSum = summarizeMove(oppBoard, x, y, opp);
  if (options.allowOverline) { if (oppSum.five) return 900_000; }
  else { if (oppSum.exactlyFive) return 900_000; }

  let score = 0;
  if (mySum.openFours >= 1) score += 50_000;
  else if (mySum.fours >= 2) score += 50_000;
  else if (mySum.fours >= 1) score += 10_000;
  if (mySum.openThrees >= 2) score += 30_000;
  if (mySum.openThrees >= 1) score += 5_000;
  if (mySum.threes >= 1) score += 500;

  if (oppSum.openFours >= 1) score += 40_000;
  else if (oppSum.fours >= 2) score += 35_000;
  else if (oppSum.fours >= 1) score += 8_000;
  if (oppSum.openThrees >= 2) score += 25_000;
  if (oppSum.openThrees >= 1) score += 4_000;
  if (oppSum.threes >= 1) score += 400;

  const size = board.length;
  const c = (size - 1) / 2;
  const dist = Math.abs(x - c) + Math.abs(y - c);
  score += Math.max(0, 30 - dist);

  return score;
}

export function getHint(board, color, options = {}) {
  const { renju = false, allowOverline = true } = options;
  const candidates = candidateCells(board);
  let best = null;
  let bestScore = -Infinity;

  for (const { x, y } of candidates) {
    if (color === BLACK && renju) {
      const f = isForbidden(board, x, y, BLACK);
      if (f.forbidden) continue;
    }
    const s = scoreCell(board, x, y, color, { allowOverline });
    if (s > bestScore) {
      bestScore = s;
      best = { x, y };
    }
  }
  return best;
}
