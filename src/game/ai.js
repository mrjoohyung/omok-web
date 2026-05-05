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
  1: { depth: 4, candidates: 14, mistake: 0, vcfDepth: 7, label: '최상' },
  2: { depth: 3, candidates: 12, mistake: 0, vcfDepth: 5, label: '상급' },
  3: { depth: 2, candidates: 10, mistake: 0.05, vcfDepth: 0, label: '중급' },
  4: { depth: 1, candidates: 12, mistake: 0.15, vcfDepth: 0, label: '초보' },
  5: { depth: 1, candidates: 8, mistake: 0.30, vcfDepth: 0, label: '입문' },
};
const HARD_TIME_LIMIT = 4000;
const VCF_TIME_BUDGET = 1500;

export function chooseAIMove(board, color, options) {
  const {
    level = 3, style = 'balanced',
    renju = false, allowOverline = true, timeLimit = HARD_TIME_LIMIT,
    exploitWeakness = false, dirWeights = null, weaknessStrength = 1.2,
  } = options;

  const cfg = LEVEL_CONFIG[level] || LEVEL_CONFIG[3];
  const opp = color === BLACK ? WHITE : BLACK;
  const startTime = Date.now();
  const exploitOpts = { exploitWeakness, dirWeights, weaknessStrength };
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
    const vcfDeadline = Math.min(startTime + VCF_TIME_BUDGET, startTime + timeLimit);
    const vcf = findVCF(board, color, cfg.vcfDepth, { renju, allowOverline, deadline: vcfDeadline });
    if (vcf) return vcf;
  }

  const scored = allCandidates
    .map(c => ({ ...c, score: scoreCellQuick(board, c.x, c.y, color, opp, style, { allowOverline, ...exploitOpts }) }))
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
  const deadline = startTime + timeLimit;

  for (const c of topCandidates) {
    if (Date.now() > deadline) break;
    const next = cloneBoard(board);
    next[c.y][c.x] = color;
    let val;
    if (cfg.depth <= 1) {
      val = c.score;
    } else {
      val = -minimax(
        next, cfg.depth - 1, -Infinity, Infinity, opp, color,
        { renju, allowOverline, style, deadline, ...exploitOpts }
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

export function evaluateBoard(board, color, style, options) {
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
  if (len === 4) return openEnds >= 2 ? PATTERN_SCORE.open4 : (openEnds === 1 ? PATTERN_SCORE.four : 0);
  if (len === 3) return openEnds >= 2 ? PATTERN_SCORE.open3 : (openEnds === 1 ? PATTERN_SCORE.three : 0);
  if (len === 2) return openEnds >= 2 ? PATTERN_SCORE.open2 : (openEnds === 1 ? PATTERN_SCORE.two : 0);
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
  if (opSum.five) d += PATTERN_SCORE.five * 1.0;
  if (opSum.openFours >= 1) d += PATTERN_SCORE.open4 * 1.0;
  d += Math.min(opSum.fours, 2) * PATTERN_SCORE.four * 0.7;
  if (opSum.openThrees >= 2) d += PATTERN_SCORE.open4 * 0.85;
  if (opSum.openThrees >= 1) d += PATTERN_SCORE.open3 * 1.1;
  if (opSum.threes >= 1) d += PATTERN_SCORE.three * 1.0;

  let myW = 1.0, opW = 1.0;
  if (style === 'attack') myW = 1.3;
  else if (style === 'defense') opW = 1.3;

  const size = board.length;
  const c = (size - 1) / 2;
  const dist = Math.abs(x - c) + Math.abs(y - c);
  const center = Math.max(0, 30 - dist);
  let total = s * myW + d * opW + center;

  // 약점 공략: AI 자기 공격 점수에만 보너스 (방어는 그대로 유지)
  if (options.exploitWeakness && options.dirWeights && s > 0) {
    const dirs = computeDirectionalStrength(my, x, y, myColor);
    const w = options.dirWeights;
    let multiplier = 1.0;
    if (dirs.horizontal) multiplier = Math.max(multiplier, w.horizontal || 1.0);
    if (dirs.vertical) multiplier = Math.max(multiplier, w.vertical || 1.0);
    if (dirs.diagonal) multiplier = Math.max(multiplier, w.diagonal || 1.0);
    if (multiplier > 1.0) {
      const strength = options.weaknessStrength || 1.2;
      const finalMultiplier = 1.0 + (multiplier - 1.0) * (strength - 1.0) / 0.2;
      const bonus = s * myW * (finalMultiplier - 1.0);
      total += bonus;
    }
  }
  return total;
}

function computeDirectionalStrength(board, x, y, color) {
  const size = board.length;
  const dirs = [
    { dx: 1, dy: 0, type: 'horizontal' },
    { dx: 0, dy: 1, type: 'vertical' },
    { dx: 1, dy: 1, type: 'diagonal' },
    { dx: 1, dy: -1, type: 'diagonal' },
  ];
  const result = { horizontal: false, vertical: false, diagonal: false };
  for (const { dx, dy, type } of dirs) {
    let count = 1;
    for (let i = 1; i < 5; i++) {
      const nx = x + dx * i, ny = y + dy * i;
      if (nx < 0 || nx >= size || ny < 0 || ny >= size) break;
      if (board[ny][nx] !== color) break;
      count++;
    }
    for (let i = 1; i < 5; i++) {
      const nx = x - dx * i, ny = y - dy * i;
      if (nx < 0 || nx >= size || ny < 0 || ny >= size) break;
      if (board[ny][nx] !== color) break;
      count++;
    }
    if (count >= 2) result[type] = true;
  }
  return result;
}

function minimax(board, depth, alpha, beta, currentColor, evalForColor, ctx) {
  if (depth === 0 || Date.now() > ctx.deadline) {
    return evaluateBoard(board, evalForColor, ctx.style, { allowOverline: ctx.allowOverline });
  }
  const opp = currentColor === BLACK ? WHITE : BLACK;
  const candidates = generateCandidates(board);
  const scored = candidates
    .map(c => ({ ...c, q: scoreCellQuick(board, c.x, c.y, currentColor, opp, 'balanced', { allowOverline: ctx.allowOverline }) }))
    .sort((a, b) => b.q - a.q)
    .slice(0, 6);

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
    if (Date.now() > ctx.deadline) break;
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
  if (Date.now() > options.deadline) return null;
  const cands = filterAttackCandidates(board, color, options);
  for (const c of cands) {
    if (Date.now() > options.deadline) return null;
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
  if (Date.now() > options.deadline) return false;

  const opp = color === BLACK ? WHITE : BLACK;
  const oppCands = generateCandidates(board);
  for (const c of oppCands) {
    const tmp = cloneBoard(board);
    tmp[c.y][c.x] = opp;
    const sum = summarizeMove(tmp, c.x, c.y, opp);
    if (options.allowOverline ? sum.five : sum.exactlyFive) return false;
  }

  const blockSpots = findFourBlockSpots(board, color, options);
  if (blockSpots.length === 0) return false;

  for (const spot of blockSpots) {
    if (Date.now() > options.deadline) return false;
    const afterBlock = cloneBoard(board);
    afterBlock[spot.y][spot.x] = opp;

    let canContinue = false;
    const myAttackCands = filterAttackCandidates(afterBlock, color, options);
    for (const c of myAttackCands) {
      if (Date.now() > options.deadline) return false;
      if (color === BLACK && options.renju && isForbidden(afterBlock, c.x, c.y, BLACK).forbidden) continue;
      const next = cloneBoard(afterBlock);
      next[c.y][c.x] = color;
      const sum = summarizeMove(next, c.x, c.y, color);
      if (options.allowOverline ? sum.five : sum.exactlyFive) { canContinue = true; break; }
      if (sum.openFours >= 1 || sum.fours >= 1) {
        if (vcfRecurse(next, color, depth - 1, options)) { canContinue = true; break; }
      }
    }
    if (!canContinue) return false;
  }
  return true;
}

function filterAttackCandidates(board, color, options) {
  const cands = generateCandidates(board);
  const out = [];
  for (const c of cands) {
    const next = cloneBoard(board);
    next[c.y][c.x] = color;
    const sum = summarizeMove(next, c.x, c.y, color);
    if (sum.five || sum.openFours >= 1 || sum.fours >= 1) out.push(c);
  }
  return out;
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
