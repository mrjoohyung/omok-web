import {
  EMPTY, BLACK, WHITE, cloneBoard, summarizeMove, isForbidden,
  DIRECTIONS,
} from './gameLogic.js';

const PATTERN_SCORE = {
  five: 1_000_000,
  open4: 100_000,
  four: 10_000,
  open3: 8_000,
  three: 800,
  open2: 200,
  two: 30,
};

export const LEVEL_CONFIG = {
  1: { depth: 1, candidates: 8, mistake: 0.30, vcfDepth: 0, label: '입문' },
  2: { depth: 1, candidates: 12, mistake: 0.15, vcfDepth: 0, label: '초보' },
  3: { depth: 3, candidates: 10, mistake: 0.05, vcfDepth: 0, label: '중급' },
  4: { depth: 4, candidates: 8, mistake: 0, vcfDepth: 7, label: '상급' },
  5: { depth: 4, candidates: 10, mistake: 0, vcfDepth: 9, label: '최상' },
};

export function chooseAIMove(board, color, options) {
  const {
    level = 3, style = 'balanced',
    renju = false, allowOverline = true, timeLimit = 3000,
  } = options;

  const cfg = LEVEL_CONFIG[level] || LEVEL_CONFIG[3];
  const opp = color === BLACK ? WHITE : BLACK;
  const startTime = Date.now();

  if (isBoardEmpty(board)) return openingMove(board, level);

  const allCandidates = generateCandidates(board);
  if (allCandidates.length === 0) return findAnyEmpty(board);

  const winMove = findImmediateWin(board, color, allCandidates, { renju, allowOverline });
  if (winMove) return winMove;

  const blockMove = findImmediateBlock(board, color, allCandidates, { allowOverline });
  if (blockMove) {
    if (color === BLACK && renju) {
      const f = isForbidden(board, blockMove.x, blockMove.y, BLACK);
      if (!f.forbidden) return blockMove;
    } else {
      return blockMove;
    }
  }

  if (cfg.vcfDepth > 0) {
    const vcf = findVCF(board, color, cfg.vcfDepth, { renju, allowOverline });
    if (vcf) return vcf;
  }

  const scored = allCandidates
    .map(c => ({ ...c, score: scoreCellQuick(board, c.x, c.y, color, opp, style, { allowOverline }) }))
    .sort((a, b) => b.score - a.score);

  let candidates = scored;
  if (color === BLACK && renju) {
    candidates = scored.filter(c => !isForbidden(board, c.x, c.y, BLACK).forbidden);
    if (candidates.length === 0) return findAnyEmpty(board);
  }

  const topCandidates = candidates.slice(0, cfg.candidates);

  let best = null;
  let bestScore = -Infinity;
  const ranked = [];

  for (const c of topCandidates) {
    if (Date.now() - startTime > timeLimit) break;
    const next = cloneBoard(board);
    next[c.y][c.x] = color;
    let val;
    if (cfg.depth <= 1) {
      val = c.score;
    } else {
      val = -minimax(
        next, cfg.depth - 1, -Infinity, Infinity, opp, color,
        { renju, allowOverline, style, startTime, timeLimit }
      );
    }
    ranked.push({ ...c, mmScore: val });
    if (val > bestScore) { bestScore = val; best = c; }
  }

  if (cfg.mistake > 0 && ranked.length >= 2 && Math.random() < cfg.mistake) {
    ranked.sort((a, b) => b.mmScore - a.mmScore);
    const idx = Math.min(ranked.length - 1, 1 + (Math.random() < 0.5 ? 0 : 1));
    return { x: ranked[idx].x, y: ranked[idx].y };
  }

  return best ? { x: best.x, y: best.y } : findAnyEmpty(board);
}

function evaluateBoard(board, color, style, options) {
  const opp = color === BLACK ? WHITE : BLACK;
  const myScore = scoreColor(board, color, options);
  const oppScore = scoreColor(board, opp, options);
  let myWeight = 1.0, oppWeight = 1.0;
  if (style === 'attack') myWeight = 1.3;
  else if (style === 'defense') oppWeight = 1.3;
  return myScore * myWeight - oppScore * oppWeight;
}

function scoreColor(board, color, options) {
  const size = board.length;
  let total = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (board[y][x] !== color) continue;
      for (const { dx, dy } of DIRECTIONS) {
        const px = x - dx, py = y - dy;
        if (px >= 0 && py >= 0 && px < size && py < size && board[py][px] === color) continue;
        let len = 1;
        let nx = x + dx, ny = y + dy;
        while (nx >= 0 && ny >= 0 && nx < size && ny < size && board[ny][nx] === color) {
          len++; nx += dx; ny += dy;
        }
        const leftEmpty = px >= 0 && py >= 0 && px < size && py < size && board[py][px] === EMPTY;
        const rightEmpty = nx >= 0 && ny >= 0 && nx < size && ny < size && board[ny][nx] === EMPTY;
        const openEnds = (leftEmpty ? 1 : 0) + (rightEmpty ? 1 : 0);
        total += linePatternScore(len, openEnds, options);
      }
    }
  }
  return total;
}

function linePatternScore(len, openEnds, options) {
  if (len >= 5) {
    if (options.allowOverline) return PATTERN_SCORE.five;
    return len === 5 ? PATTERN_SCORE.five : 0;
  }
  if (len === 4) {
    if (openEnds >= 2) return PATTERN_SCORE.open4;
    if (openEnds === 1) return PATTERN_SCORE.four;
    return 0;
  }
  if (len === 3) {
    if (openEnds >= 2) return PATTERN_SCORE.open3;
    if (openEnds === 1) return PATTERN_SCORE.three;
    return 0;
  }
  if (len === 2) {
    if (openEnds >= 2) return PATTERN_SCORE.open2;
    if (openEnds === 1) return PATTERN_SCORE.two;
    return 0;
  }
  return 0;
}

function scoreCellQuick(board, x, y, myColor, oppColor, style, options) {
  const my = cloneBoard(board); my[y][x] = myColor;
  const op = cloneBoard(board); op[y][x] = oppColor;
  const mySum = summarizeMove(my, x, y, myColor);
  const opSum = summarizeMove(op, x, y, oppColor);

  let s = 0;
  if (mySum.five) s += PATTERN_SCORE.five;
  if (mySum.openFours >= 1) s += PATTERN_SCORE.open4;
  s += Math.min(mySum.fours, 2) * PATTERN_SCORE.four * 0.5;
  if (mySum.openThrees >= 2) s += PATTERN_SCORE.open4 * 0.7;
  if (mySum.openThrees >= 1) s += PATTERN_SCORE.open3;
  if (mySum.threes >= 1) s += PATTERN_SCORE.three;

  let d = 0;
  if (opSum.five) d += PATTERN_SCORE.five * 0.95;
  if (opSum.openFours >= 1) d += PATTERN_SCORE.open4 * 0.95;
  d += Math.min(opSum.fours, 2) * PATTERN_SCORE.four * 0.5;
  if (opSum.openThrees >= 2) d += PATTERN_SCORE.open4 * 0.65;
  if (opSum.openThrees >= 1) d += PATTERN_SCORE.open3 * 0.9;
  if (opSum.threes >= 1) d += PATTERN_SCORE.three * 0.9;

  let myW = 1.0, opW = 1.0;
  if (style === 'attack') myW = 1.3;
  else if (style === 'defense') opW = 1.3;

  const size = board.length;
  const c = (size - 1) / 2;
  const dist = Math.abs(x - c) + Math.abs(y - c);
  const center = Math.max(0, 30 - dist);
  return s * myW + d * opW + center;
}

function minimax(board, depth, alpha, beta, currentColor, evalForColor, ctx) {
  if (depth === 0 || Date.now() - ctx.startTime > ctx.timeLimit) {
    return evaluateBoard(board, evalForColor, ctx.style, { allowOverline: ctx.allowOverline });
  }
  const opp = currentColor === BLACK ? WHITE : BLACK;
  const candidates = generateCandidates(board);
  const scored = candidates
    .map(c => ({ ...c, q: scoreCellQuick(board, c.x, c.y, currentColor, opp, 'balanced', { allowOverline: ctx.allowOverline }) }))
    .sort((a, b) => b.q - a.q)
    .slice(0, 8);

  let useCandidates = scored;
  if (currentColor === BLACK && ctx.renju) {
    useCandidates = scored.filter(c => !isForbidden(board, c.x, c.y, BLACK).forbidden);
  }
  if (useCandidates.length === 0) {
    return evaluateBoard(board, evalForColor, ctx.style, { allowOverline: ctx.allowOverline });
  }

  const maximizing = currentColor === evalForColor;
  let best = maximizing ? -Infinity : Infinity;

  for (const c of useCandidates) {
    if (Date.now() - ctx.startTime > ctx.timeLimit) break;
    const next = cloneBoard(board);
    next[c.y][c.x] = currentColor;
    const sum = summarizeMove(next, c.x, c.y, currentColor);
    let val;
    if (sum.five && (ctx.allowOverline || sum.exactlyFive)) {
      val = maximizing ? PATTERN_SCORE.five : -PATTERN_SCORE.five;
    } else {
      val = minimax(next, depth - 1, alpha, beta, opp, evalForColor, ctx);
    }
    if (maximizing) {
      best = Math.max(best, val);
      alpha = Math.max(alpha, val);
    } else {
      best = Math.min(best, val);
      beta = Math.min(beta, val);
    }
    if (beta <= alpha) break;
  }
  return best;
}

function generateCandidates(board) {
  const size = board.length;
  const seen = new Set();
  const out = [];
  let hasAny = false;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (board[y][x] === EMPTY) continue;
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
  if (!hasAny) {
    const c = Math.floor(size / 2);
    return [{ x: c, y: c }];
  }
  return out;
}

function isBoardEmpty(board) {
  for (let y = 0; y < board.length; y++) {
    for (let x = 0; x < board.length; x++) {
      if (board[y][x] !== EMPTY) return false;
    }
  }
  return true;
}

function findAnyEmpty(board) {
  for (let y = 0; y < board.length; y++) {
    for (let x = 0; x < board.length; x++) {
      if (board[y][x] === EMPTY) return { x, y };
    }
  }
  return null;
}

function findImmediateWin(board, color, candidates, options) {
  for (const c of candidates) {
    if (color === BLACK && options.renju && isForbidden(board, c.x, c.y, BLACK).forbidden) continue;
    const next = cloneBoard(board);
    next[c.y][c.x] = color;
    const sum = summarizeMove(next, c.x, c.y, color);
    if (options.allowOverline ? sum.five : sum.exactlyFive) return c;
  }
  return null;
}

function findImmediateBlock(board, color, candidates, options) {
  const opp = color === BLACK ? WHITE : BLACK;
  for (const c of candidates) {
    const next = cloneBoard(board);
    next[c.y][c.x] = opp;
    const sum = summarizeMove(next, c.x, c.y, opp);
    if (options.allowOverline ? sum.five : sum.exactlyFive) return c;
  }
  return null;
}

function findVCF(board, color, maxDepth, options) {
  const cands = generateCandidates(board);
  for (const c of cands) {
    if (color === BLACK && options.renju && isForbidden(board, c.x, c.y, BLACK).forbidden) continue;
    const next = cloneBoard(board);
    next[c.y][c.x] = color;
    const sum = summarizeMove(next, c.x, c.y, color);
    if (options.allowOverline ? sum.five : sum.exactlyFive) return c;
    if (sum.openFours >= 1 || sum.fours >= 1) {
      if (vcfRecurse(next, color, maxDepth - 1, options)) return c;
    }
  }
  return null;
}

function vcfRecurse(board, color, depth, options) {
  if (depth <= 0) return false;
  const opp = color === BLACK ? WHITE : BLACK;
  const cands = generateCandidates(board);
  for (const c of cands) {
    const tmp = cloneBoard(board);
    tmp[c.y][c.x] = opp;
    const sum = summarizeMove(tmp, c.x, c.y, opp);
    if (options.allowOverline ? sum.five : sum.exactlyFive) return false;
  }

  const blockSpots = findFourBlockSpots(board, color, options);
  if (blockSpots.length === 0) return false;

  for (const spot of blockSpots) {
    const afterBlock = cloneBoard(board);
    afterBlock[spot.y][spot.x] = opp;
    let canContinue = false;
    const myCands = generateCandidates(afterBlock);
    for (const c of myCands) {
      if (color === BLACK && options.renju && isForbidden(afterBlock, c.x, c.y, BLACK).forbidden) continue;
      const next = cloneBoard(afterBlock);
      next[c.y][c.x] = color;
      const sum = summarizeMove(next, c.x, c.y, color);
      if (options.allowOverline ? sum.five : sum.exactlyFive) {
        canContinue = true; break;
      }
      if (sum.openFours >= 1 || sum.fours >= 1) {
        if (vcfRecurse(next, color, depth - 1, options)) {
          canContinue = true; break;
        }
      }
    }
    if (!canContinue) return false;
  }
  return true;
}

function findFourBlockSpots(board, color, options) {
  const size = board.length;
  const spots = new Map();
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (board[y][x] !== EMPTY) continue;
      const next = cloneBoard(board);
      next[y][x] = color;
      const sum = summarizeMove(next, x, y, color);
      if (options.allowOverline ? sum.five : sum.exactlyFive) {
        spots.set(y * size + x, { x, y });
      }
    }
  }
  return Array.from(spots.values());
}

function openingMove(board, level) {
  const size = board.length;
  const c = Math.floor(size / 2);
  if (level <= 3) return { x: c, y: c };
  const candidates = [
    { x: c, y: c }, { x: c, y: c }, { x: c, y: c },
    { x: c - 1, y: c - 1 }, { x: c + 1, y: c - 1 },
    { x: c - 1, y: c + 1 }, { x: c + 1, y: c + 1 },
  ];
  return candidates[Math.floor(Math.random() * candidates.length)];
}
