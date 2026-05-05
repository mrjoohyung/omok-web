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

// Lv1=쉬움, Lv5=어려움 (정상)
// Lv3+ : 위협 자리 강제 후보 포함 (threatForce)
// Lv3+ : 반복심화 적용 (1차 빠르게, 2차 깊게)
export const LEVEL_CONFIG = {
  1: { depth: 1, candidates: 5, mistake: 0.30, vcfDepth: 0, vctDepth: 0, label: '입문',
       threatForce: false, deepDepth: 0, deepCandidates: 0 },
  2: { depth: 1, candidates: 8, mistake: 0.10, vcfDepth: 0, vctDepth: 0, label: '초보',
       threatForce: false, deepDepth: 0, deepCandidates: 0 },
  3: { depth: 2, candidates: 10, mistake: 0.05, vcfDepth: 0, vctDepth: 0, label: '중급',
       threatForce: true, deepDepth: 3, deepCandidates: 5 },
  4: { depth: 3, candidates: 15, mistake: 0, vcfDepth: 5, vctDepth: 4, label: '상급',
       threatForce: true, deepDepth: 5, deepCandidates: 5 },
  5: { depth: 3, candidates: 12, mistake: 0, vcfDepth: 7, vctDepth: 5, label: '최상',
       threatForce: true, deepDepth: 5, deepCandidates: 6 },
};

// 응답 시간 한도
const HARD_TIME_LIMIT = 4000; // 4초 안전망
const VCF_TIME_BUDGET = 1200;
const VCT_TIME_BUDGET = 1000;
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

  // 정석 책 참조 (Lv3+, 첫 5수 이내)
  if (level >= 3) {
    const moveCount = countStones(board);
    if (moveCount <= 4) {
      const bookMove = lookupOpeningBook(board, color, moveCount);
      if (bookMove) return bookMove;
    }
  }

  const allCandidates = generateCandidates(board);
  if (allCandidates.length === 0) return findAnyEmpty(board);

  const winMove = findImmediateWin(board, color, allCandidates, { renju, allowOverline });
  if (winMove) return winMove;

  // 2) 즉시 차단 (상대 5목)
  const blockMove = findImmediateBlock(board, color, allCandidates, { allowOverline });
  if (blockMove) {
    if (color === BLACK && renju) {
      const f = isForbidden(board, blockMove.x, blockMove.y, BLACK);
      if (!f.forbidden) return blockMove;
    } else {
      return blockMove;
    }
  }

  // 2-b) 긴급 방어: 상대가 열린4/더블3/4/열린3 만드는 자리는 반드시 막음 (Lv3+)
  if (level >= 3) {
    const urgentBlock = findUrgentDefense(board, color, opp, allCandidates, { allowOverline, renju });
    if (urgentBlock) {
      if (color === BLACK && renju) {
        const f = isForbidden(board, urgentBlock.x, urgentBlock.y, BLACK);
        if (!f.forbidden) return urgentBlock;
      } else {
        return urgentBlock;
      }
    }
  }

  // 3) VCF (Lv4-5) — 시간 한도 내에서만
  if (cfg.vcfDepth > 0) {
    const vcfDeadline = Math.min(startTime + VCF_TIME_BUDGET, startTime + timeLimit);
    const vcf = findVCF(board, color, cfg.vcfDepth, { renju, allowOverline, deadline: vcfDeadline });
    if (vcf) return vcf;
  }

  // 3-b) VCT (Lv4-5) — 4 + 3 결합 연쇄로 이기는 길
  if (cfg.vctDepth > 0) {
    const vctDeadline = Math.min(startTime + VCF_TIME_BUDGET + VCT_TIME_BUDGET, startTime + timeLimit);
    if (Date.now() < vctDeadline) {
      const vct = findVCT(board, color, cfg.vctDepth, { renju, allowOverline, deadline: vctDeadline });
      if (vct) return vct;
    }
  }

  const scored = allCandidates
    .map(c => ({ ...c, score: scoreCellQuick(board, c.x, c.y, color, opp, style, { allowOverline, ...exploitOpts }) }))
    .sort((a, b) => b.score - a.score);
  let candidates = scored;
  if (color === BLACK && renju) {
    candidates = scored.filter(c => !isForbidden(board, c.x, c.y, BLACK).forbidden);
    if (candidates.length === 0) return findAnyEmpty(board);
  }

// 4-b) 위협 자리 강제 포함 (Lv3+)
  let topCandidates = candidates.slice(0, cfg.candidates);
  if (cfg.threatForce) {
    const threats = findThreatPositions(board, color, opp, candidates, { allowOverline, renju });
    const threatToAdd = threats
      .filter(t => !topCandidates.some(tc => tc.x === t.x && tc.y === t.y))
      .slice(0, 5);
    topCandidates = [...topCandidates, ...threatToAdd];
  }

  // 5) 미니맥스 (반복심화 적용 가능)
  const deadline = startTime + timeLimit;
  // Transposition Table - 같은 보드 상태 재방문 캐싱 (Lv4+)
  const tt = (cfg.depth >= 3 || cfg.deepDepth >= 3) ? new Map() : null;
  let best = null;
  let bestScore = -Infinity;
  let ranked = [];

  // 1차 탐색: cfg.depth 깊이로 모든 후보 평가
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
        { renju, allowOverline, style, deadline, tt, ...exploitOpts }
      );
    }
    ranked.push({ ...c, mmScore: val });
    if (val > bestScore) { bestScore = val; best = c; }
  }

  // 2차 탐색 (반복심화): Lv3+ 에서 상위 deepCandidates개만 deepDepth 깊이로 재평가
  if (cfg.deepDepth > cfg.depth && cfg.deepCandidates > 0 && Date.now() < deadline) {
    ranked.sort((a, b) => b.mmScore - a.mmScore);
    const deepTop = ranked.slice(0, cfg.deepCandidates);
    let deepBest = null;
    let deepBestScore = -Infinity;
    const deepRanked = [];
    for (const c of deepTop) {
      if (Date.now() > deadline) break;
      const next = cloneBoard(board);
      next[c.y][c.x] = color;
      const val = -minimax(
        next, cfg.deepDepth - 1, -Infinity, Infinity, opp, color,
        { renju, allowOverline, style, deadline, tt, ...exploitOpts }
      );
      deepRanked.push({ ...c, mmScore: val });
      if (val > deepBestScore) { deepBestScore = val; deepBest = c; }
    }
    if (deepBest && deepRanked.length > 0) {
      best = deepBest;
      bestScore = deepBestScore;
      ranked = deepRanked;
    }
  }

  // 6) 실수율 적용
  if (cfg.mistake > 0 && ranked.length >= 2 && Math.random() < cfg.mistake) {
    ranked.sort((a, b) => b.mmScore - a.mmScore);
    const idx = Math.min(ranked.length - 1, 1 + (Math.random() < 0.5 ? 0 : 1));
    return { x: ranked[idx].x, y: ranked[idx].y };
  }

  return best ? { x: best.x, y: best.y } : findAnyEmpty(board);
}

// =======================================================================
// 위협 자리 찾기 (Threat Space)
// =======================================================================
function findThreatPositions(board, myColor, oppColor, candidates, options) {
  const out = [];
  const seen = new Set();

  for (const c of candidates) {
    const key = `${c.x},${c.y}`;
    if (seen.has(key)) continue;

    const myBoard = cloneBoard(board);
    myBoard[c.y][c.x] = myColor;
    const myInfo = countPatternsAt(myBoard, c.x, c.y, myColor);
    if (myInfo.fours >= 1 || myInfo.openThrees >= 2) {
      out.push({ ...c, threat: 'attack-strong' });
      seen.add(key);
      continue;
    }

    const oppBoard = cloneBoard(board);
    oppBoard[c.y][c.x] = oppColor;
    const oppInfo = countPatternsAt(oppBoard, c.x, c.y, oppColor);
    if (oppInfo.fours >= 1 || oppInfo.openThrees >= 2) {
      out.push({ ...c, threat: 'defense-must' });
      seen.add(key);
      continue;
    }

    if (myInfo.openThrees >= 1) {
      out.push({ ...c, threat: 'attack-open3' });
      seen.add(key);
      continue;
    }

    if (oppInfo.openThrees >= 1) {
      out.push({ ...c, threat: 'defense-open3' });
      seen.add(key);
    }
  }

  const priority = { 'defense-must': 0, 'attack-strong': 1, 'defense-open3': 2, 'attack-open3': 3 };
  out.sort((a, b) => priority[a.threat] - priority[b.threat]);
  return out;
}

function countPatternsAt(board, x, y, color) {
  const size = board.length;
  const dirs = [[1,0],[0,1],[1,1],[1,-1]];
  let fours = 0, openThrees = 0;

  for (const [dx, dy] of dirs) {
    let count = 1;
    let openL = false, openR = false;
    for (let i = 1; i < 5; i++) {
      const nx = x + dx*i, ny = y + dy*i;
      if (nx<0||ny<0||nx>=size||ny>=size) break;
      if (board[ny][nx] === color) count++;
      else { if (board[ny][nx] === EMPTY) openR = true; break; }
    }
    for (let i = 1; i < 5; i++) {
      const nx = x - dx*i, ny = y - dy*i;
      if (nx<0||ny<0||nx>=size||ny>=size) break;
      if (board[ny][nx] === color) count++;
      else { if (board[ny][nx] === EMPTY) openL = true; break; }
    }
    if (count === 4) fours++;
    else if (count === 3 && openL && openR) openThrees++;
  }
  return { fours, openThrees };
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
  s += Math.min(mySum.fours, 2) * PATTERN_SCORE.four * 0.7;  // 닫힌 4 강화
  // 더블 3 (쌍삼) 강화 - 거의 이기는 패턴
  if (mySum.openThrees >= 2) s += PATTERN_SCORE.open4 * 0.95;
  if (mySum.openThrees >= 1) s += PATTERN_SCORE.open3;
  if (mySum.threes >= 1) s += PATTERN_SCORE.three;
  // 삼-사 결합: 4 + 3 동시 (강력한 이중 위협)
  if (mySum.fours >= 1 && (mySum.openThrees >= 1 || mySum.threes >= 1)) {
    s += PATTERN_SCORE.open4 * 0.5;
  }

  let d = 0;
  if (opSum.five) d += PATTERN_SCORE.five * 1.0;
  if (opSum.openFours >= 1) d += PATTERN_SCORE.open4 * 1.0;
  d += Math.min(opSum.fours, 2) * PATTERN_SCORE.four * 0.85;
  if (opSum.openThrees >= 2) d += PATTERN_SCORE.open4 * 0.95;
  if (opSum.openThrees >= 1) d += PATTERN_SCORE.open3 * 1.1;
  if (opSum.threes >= 1) d += PATTERN_SCORE.three * 1.0;
  if (opSum.fours >= 1 && (opSum.openThrees >= 1 || opSum.threes >= 1)) {
    d += PATTERN_SCORE.open4 * 0.5;
  }

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

  // === Transposition Table 조회 ===
  const ttKey = ctx.tt ? hashBoard(board) + ':' + currentColor + ':' + depth : null;
  if (ttKey && ctx.tt.has(ttKey)) {
    const entry = ctx.tt.get(ttKey);
    if (entry.depth >= depth) {
      if (entry.flag === 'exact') return entry.value;
      if (entry.flag === 'lower' && entry.value >= beta) return entry.value;
      if (entry.flag === 'upper' && entry.value <= alpha) return entry.value;
    }
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
  const origAlpha = alpha;
  const origBeta = beta;

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

  // === Transposition Table 저장 ===
  if (ttKey && ctx.tt && ctx.tt.size < 50000) {
    let flag = 'exact';
    if (best <= origAlpha) flag = 'upper';
    else if (best >= origBeta) flag = 'lower';
    ctx.tt.set(ttKey, { value: best, depth, flag });
  }

  return best;
}

// 보드 해시 (Transposition Table 키)
function hashBoard(board) {
  const size = board.length;
  let hash = '';
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      hash += board[y][x] === EMPTY ? '.' : (board[y][x] === BLACK ? 'B' : 'W');
    }
  }
  return hash;
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

function countStones(board) {
  let n = 0;
  for (let y = 0; y < board.length; y++) {
    for (let x = 0; x < board.length; x++) {
      if (board[y][x] !== EMPTY) n++;
    }
  }
  return n;
}

// =======================================================================
// 정석 책 (Opening Book) - 미니 버전
// =======================================================================
const WHITE_RESPONSES_TO_CENTER = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 1, y: -1 },
  { x: 1, y: 1 },
];

function blackThirdMoves(whiteX, whiteY) {
  if (whiteX === 0 || whiteY === 0) {
    return [
      { x: -whiteX, y: -whiteY },
      { x: whiteX + (whiteY === 0 ? 0 : 1), y: whiteY + (whiteX === 0 ? 0 : 1) },
      { x: 1, y: 1 },
      { x: -1, y: -1 },
    ];
  }
  return [
    { x: -whiteX, y: -whiteY },
    { x: whiteX, y: 0 },
    { x: 0, y: whiteY },
    { x: whiteX * 2, y: whiteY * 2 },
  ];
}

function lookupOpeningBook(board, color, moveCount) {
  const size = board.length;
  const c = Math.floor(size / 2);

  const blacks = [], whites = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (board[y][x] === BLACK) blacks.push({ x, y });
      else if (board[y][x] === WHITE) whites.push({ x, y });
    }
  }

  if (color === WHITE && moveCount === 1 && blacks.length === 1) {
    const b = blacks[0];
    if (b.x !== c || b.y !== c) return null;
    const choice = WHITE_RESPONSES_TO_CENTER[
      Math.floor(Math.random() * WHITE_RESPONSES_TO_CENTER.length)
    ];
    const move = { x: c + choice.x, y: c + choice.y };
    if (board[move.y]?.[move.x] === EMPTY) return move;
  }

  if (color === BLACK && moveCount === 2 && blacks.length === 1 && whites.length === 1) {
    const b = blacks[0];
    if (b.x !== c || b.y !== c) return null;
    const w = whites[0];
    const dx = w.x - c, dy = w.y - c;
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) return null;
    const responses = blackThirdMoves(dx, dy);
    const valid = responses
      .map(r => ({ x: c + r.x, y: c + r.y }))
      .filter(p => p.x >= 0 && p.x < size && p.y >= 0 && p.y < size && board[p.y][p.x] === EMPTY);
    if (valid.length > 0) {
      return valid[Math.floor(Math.random() * valid.length)];
    }
  }

  return null;
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

// 긴급 방어: 상대가 두면 열린4/더블3/4/열린3 만드는 자리 막기
// 우선순위: 열린 4 > 더블 3 > 닫힌 4 > 열린 3
// 단, 본인이 그 자리에서 5목/열린4 가능하면 자기 공격이 더 강함
function findUrgentDefense(board, color, opp, candidates, options) {
  let bestBlock = null;
  let bestPriority = 999;

  for (const c of candidates) {
    const oppBoard = cloneBoard(board);
    oppBoard[c.y][c.x] = opp;
    const oppSum = summarizeMove(oppBoard, c.x, c.y, opp);

    let priority = 999;
    if (oppSum.openFours >= 1) priority = 1;
    else if (oppSum.openThrees >= 2) priority = 2;
    else if (oppSum.fours >= 1) priority = 3;
    else if (oppSum.openThrees >= 1) priority = 4;

    if (priority < bestPriority) {
      // 본인이 그 자리에서 5목/열린4 가능하면 자기 공격 우선
      const myBoard = cloneBoard(board);
      myBoard[c.y][c.x] = color;
      const mySum = summarizeMove(myBoard, c.x, c.y, color);
      if ((options.allowOverline ? mySum.five : mySum.exactlyFive)
          || mySum.openFours >= 1) {
        // 자기 공격이 더 강함 - 일단 후보로 기록만
        if (priority < bestPriority) {
          bestPriority = priority;
          bestBlock = c;
        }
        continue;
      }
      bestPriority = priority;
      bestBlock = c;
    }
  }

  if (bestPriority >= 999) return null;
  return bestBlock;
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

// 공격 후보만: "두면 4 또는 5목이 되는 자리"
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

// VCT 공격 후보: 4 이상 OR 열린3 OR 3+4 결합
function filterVCTCandidates(board, color, options) {
  const cands = generateCandidates(board);
  const out = [];
  for (const c of cands) {
    const next = cloneBoard(board);
    next[c.y][c.x] = color;
    const sum = summarizeMove(next, c.x, c.y, color);
    if (sum.five) { out.push({ ...c, type: 'win', sum }); continue; }
    if (sum.openFours >= 1) { out.push({ ...c, type: 'open4', sum }); continue; }
    if (sum.fours >= 1) {
      if (sum.openThrees >= 1 || sum.threes >= 1) {
        out.push({ ...c, type: '4+3', sum });
      } else {
        out.push({ ...c, type: 'four', sum });
      }
      continue;
    }
    if (sum.openThrees >= 2) { out.push({ ...c, type: 'double3', sum }); continue; }
    if (sum.openThrees >= 1) { out.push({ ...c, type: 'open3', sum }); continue; }
  }
  const priority = { 'win': 0, 'open4': 1, '4+3': 2, 'double3': 3, 'four': 4, 'open3': 5 };
  out.sort((a, b) => priority[a.type] - priority[b.type]);
  return out;
}

// =======================================================================
// VCT (Victory by Continuous Threat): 4+3 결합으로 이기는 길
// =======================================================================
function findVCT(board, color, maxDepth, options) {
  if (Date.now() > options.deadline) return null;
  const cands = filterVCTCandidates(board, color, options);
  for (const c of cands) {
    if (Date.now() > options.deadline) return null;
    if (color === BLACK && options.renju && isForbidden(board, c.x, c.y, BLACK).forbidden) continue;
    const next = cloneBoard(board);
    next[c.y][c.x] = color;
    const sum = c.sum;
    if (options.allowOverline ? sum.five : sum.exactlyFive) return c;
    if (sum.openFours >= 1 || sum.fours >= 1 || sum.openThrees >= 2) {
      if (vctRecurse(next, color, maxDepth - 1, options)) return c;
    }
  }
  return null;
}

function vctRecurse(board, color, depth, options) {
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

  const blockSpots = findThreatBlockSpots(board, color, options);
  if (blockSpots.length === 0) return false;
  const limitedSpots = blockSpots.slice(0, 6);

  for (const spot of limitedSpots) {
    if (Date.now() > options.deadline) return false;
    const afterBlock = cloneBoard(board);
    afterBlock[spot.y][spot.x] = opp;

    let canContinue = false;
    const myCands = filterVCTCandidates(afterBlock, color, options);
    const limitedCands = myCands.slice(0, 5);

    for (const c of limitedCands) {
      if (Date.now() > options.deadline) return false;
      if (color === BLACK && options.renju && isForbidden(afterBlock, c.x, c.y, BLACK).forbidden) continue;
      const next = cloneBoard(afterBlock);
      next[c.y][c.x] = color;
      const sum = c.sum;
      if (options.allowOverline ? sum.five : sum.exactlyFive) { canContinue = true; break; }
      if (sum.openFours >= 1 || sum.fours >= 1 || sum.openThrees >= 2) {
        if (vctRecurse(next, color, depth - 1, options)) { canContinue = true; break; }
      }
    }
    if (!canContinue) return false;
  }
  return true;
}

function findThreatBlockSpots(board, color, options) {
  const size = board.length;
  const spots = new Map();
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (board[y][x] !== EMPTY) continue;
      const next = cloneBoard(board);
      next[y][x] = color;
      const sum = summarizeMove(next, x, y, color);
      if ((options.allowOverline ? sum.five : sum.exactlyFive)
          || sum.openFours >= 1 || sum.fours >= 1
          || sum.openThrees >= 2) {
        spots.set(y * size + x, { x, y });
      }
    }
  }
  return Array.from(spots.values());
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
