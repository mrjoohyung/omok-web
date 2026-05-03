const MIN_GAMES_FOR_ANALYSIS = 5;

export function computeStrengths(games, statsAi, statsByLevel) {
  const aiGames = games.filter(g => g.mode === 'pvc');
  if (aiGames.length < MIN_GAMES_FOR_ANALYSIS) {
    return { enoughData: false, need: MIN_GAMES_FOR_ANALYSIS, have: aiGames.length };
  }

  const strengths = [];
  const weaknesses = [];

  const bTotal = (statsAi?.asBlack?.total) || 0;
  const wTotal = (statsAi?.asWhite?.total) || 0;
  const bWins = (statsAi?.asBlack?.wins) || 0;
  const wWins = (statsAi?.asWhite?.wins) || 0;

  if (bTotal >= MIN_GAMES_FOR_ANALYSIS) {
    const rate = Math.round((bWins / bTotal) * 100);
    if (rate >= 60) strengths.push({ key: 'asBlack', text: `흑일 때 강함 (승률 ${rate}%)`, rate });
    else if (rate <= 30) weaknesses.push({ key: 'asBlack', text: `흑일 때 약함 (승률 ${rate}%)`, rate });
  }
  if (wTotal >= MIN_GAMES_FOR_ANALYSIS) {
    const rate = Math.round((wWins / wTotal) * 100);
    if (rate >= 60) strengths.push({ key: 'asWhite', text: `백일 때 강함 (승률 ${rate}%)`, rate });
    else if (rate <= 30) weaknesses.push({ key: 'asWhite', text: `백일 때 약함 (승률 ${rate}%)`, rate });
  }

  if (bTotal >= MIN_GAMES_FOR_ANALYSIS && wTotal >= MIN_GAMES_FOR_ANALYSIS) {
    const bRate = bWins / bTotal;
    const wRate = wWins / wTotal;
    const diff = Math.abs(bRate - wRate);
    if (diff >= 0.20) {
      const better = bRate > wRate ? '흑' : '백';
      const worse = bRate > wRate ? '백' : '흑';
      strengths.push({
        key: 'colorPref',
        text: `${better}이 ${worse}보다 ${Math.round(diff * 100)}%p 잘함`,
      });
    }
  }

  const consistentLevels = [];
  for (let lv = 1; lv <= 5; lv++) {
    const slot = statsByLevel?.[lv] || {};
    const b = slot.asBlack || {};
    const w = slot.asWhite || {};
    const total = (b.wins || 0) + (b.losses || 0) + (b.draws || 0)
                + (w.wins || 0) + (w.losses || 0) + (w.draws || 0);
    const wins = (b.wins || 0) + (w.wins || 0);
    if (total >= MIN_GAMES_FOR_ANALYSIS) {
      consistentLevels.push({ lv, total, rate: wins / total, wins });
    }
  }

  const strongLevels = consistentLevels.filter(l => l.rate >= 0.60);
  if (strongLevels.length > 0) {
    const lvs = strongLevels.map(l => `Lv${l.lv}`).join(', ');
    strengths.push({
      key: 'strongLevels',
      text: `${lvs}에서 안정적 (${strongLevels.reduce((s, l) => s + l.wins, 0)}승 ${strongLevels.reduce((s, l) => s + (l.total - l.wins), 0)}패)`,
    });
  }

  const weakLevels = consistentLevels.filter(l => l.rate < 0.30);
  if (weakLevels.length > 0) {
    const lvs = weakLevels.map(l => `Lv${l.lv}`).join(', ');
    weaknesses.push({ key: 'weakLevels', text: `${lvs}에서 패배 빈도 높음` });
  }

  for (let i = 0; i < consistentLevels.length - 1; i++) {
    const cur = consistentLevels[i];
    const next = consistentLevels[i + 1];
    if (next.lv === cur.lv + 1 && cur.rate >= 0.50 && next.rate < 0.30) {
      weaknesses.push({
        key: 'levelWall',
        text: `Lv${cur.lv}까지는 잘하지만 Lv${next.lv}부터 급격히 어려움`,
      });
    }
  }

  return { enoughData: true, have: aiGames.length, strengths, weaknesses };
}

export function computeTrendSeries(games, windowSize = 5) {
  const aiGames = games.filter(g => g.mode === 'pvc');
  if (aiGames.length < MIN_GAMES_FOR_ANALYSIS) return [];

  const sorted = [...aiGames].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  const series = [];
  let cumulativeWins = 0;
  for (let i = 0; i < sorted.length; i++) {
    const g = sorted[i];
    if (g.userWon === true) cumulativeWins++;
    const idx = i + 1;
    const cumulativeRate = Math.round((cumulativeWins / idx) * 100);

    let recentRate = null;
    if (idx >= windowSize) {
      let winsInWindow = 0;
      for (let j = idx - windowSize; j < idx; j++) {
        if (sorted[j].userWon === true) winsInWindow++;
      }
      recentRate = Math.round((winsInWindow / windowSize) * 100);
    }
    series.push({ idx, cumulative: cumulativeRate, recent5: recentRate });
  }
  return series;
}

export function computeRecentChange(series, windowSize = 5) {
  if (series.length < windowSize * 2) return null;
  const latest = series[series.length - 1];
  const prev = series[series.length - 1 - windowSize];
  if (!latest || latest.recent5 === null || !prev || prev.recent5 === null) return null;
  const diff = latest.recent5 - prev.recent5;
  let trend;
  if (diff >= 15) trend = '실력 향상 중';
  else if (diff <= -15) trend = '슬럼프 구간';
  else trend = '안정적';
  return { current: latest.recent5, prev: prev.recent5, diff, trend };
}
// =======================================================================
// 패턴 분석 (B-2c: AI 약점 공략용)
// =======================================================================

const MIN_GAMES_FOR_PATTERN = 20;
const PATTERN_WINDOW = 30;

export function computePlayerPattern(games) {
  const aiGames = games.filter(g => g.mode === 'pvc' && Array.isArray(g.moves) && g.moves.length > 0);
  if (aiGames.length < MIN_GAMES_FOR_PATTERN) {
    return {
      enoughData: false,
      have: aiGames.length,
      need: MIN_GAMES_FOR_PATTERN,
    };
  }

  const recent = aiGames.slice(0, PATTERN_WINDOW);
  const lostGames = recent.filter(g => g.userWon === false && g.winner !== 'draw');
  const wonGames = recent.filter(g => g.userWon === true);

  // 1) 방향 약점
  const dirCounts = { horizontal: 0, vertical: 0, diagonal: 0 };
  for (const g of lostGames) {
    const dir = inferWinningDirection(g);
    if (dir) dirCounts[dir]++;
  }
  const totalDirs = dirCounts.horizontal + dirCounts.vertical + dirCounts.diagonal;
  const dirWeights = { horizontal: 1.0, vertical: 1.0, diagonal: 1.0 };
  if (totalDirs > 0) {
    for (const k of Object.keys(dirCounts)) {
      const ratio = dirCounts[k] / totalDirs;
      if (ratio > 0.40) dirWeights[k] = 1.2;
    }
  }

  // 2) 공수 비율
  let attackMoves = 0;
  let defenseMoves = 0;
  for (const g of recent) {
    const userColor = g.userColor === 'white' ? 2 : 1;
    const stats = countAttackVsDefense(g.moves, userColor, g.boardSize || 15);
    attackMoves += stats.attack;
    defenseMoves += stats.defense;
  }
  const totalAD = attackMoves + defenseMoves;
  let playerType = 'balanced';
  if (totalAD > 0) {
    const attackRatio = attackMoves / totalAD;
    if (attackRatio >= 0.65) playerType = 'attacker';
    else if (attackRatio <= 0.35) playerType = 'defender';
  }

  // 3) 첫 수 패턴
  let centerFirst = 0;
  let outsideFirst = 0;
  for (const g of recent) {
    const firstMove = g.moves[0];
    if (!firstMove) continue;
    const size = g.boardSize || 15;
    const center = Math.floor(size / 2);
    const dist = Math.max(Math.abs(firstMove.x - center), Math.abs(firstMove.y - center));
    if (dist <= 2) centerFirst++;
    else outsideFirst++;
  }
  let openingPref = 'mixed';
  const totalOpen = centerFirst + outsideFirst;
  if (totalOpen > 0) {
    const centerRatio = centerFirst / totalOpen;
    if (centerRatio >= 0.75) openingPref = 'center';
    else if (centerRatio <= 0.25) openingPref = 'outside';
  }

  // 4) 종반 약점
  let endgameWeak = false;
  if (lostGames.length >= 5 && wonGames.length >= 5) {
    const avgLossLen = lostGames.reduce((s, g) => s + (g.moves?.length || 0), 0) / lostGames.length;
    const avgWinLen = wonGames.reduce((s, g) => s + (g.moves?.length || 0), 0) / wonGames.length;
    if (avgLossLen > avgWinLen * 1.3) endgameWeak = true;
  }

  return {
    enoughData: true,
    have: aiGames.length,
    dirWeights,
    dirCounts,
    playerType,
    attackRatio: totalAD > 0 ? attackMoves / totalAD : 0.5,
    openingPref,
    centerRatio: totalOpen > 0 ? centerFirst / totalOpen : 0.5,
    endgameWeak,
    avgLossLen: lostGames.length > 0 ? lostGames.reduce((s,g) => s + (g.moves?.length || 0), 0) / lostGames.length : 0,
    avgWinLen: wonGames.length > 0 ? wonGames.reduce((s,g) => s + (g.moves?.length || 0), 0) / wonGames.length : 0,
  };
}

function inferWinningDirection(game) {
  if (!game.moves || game.moves.length < 5) return null;
  if (game.winReason !== 'five') return null;

  const moves = game.moves;
  const lastMove = moves[moves.length - 1];
  const winColor = lastMove.color;

  const size = game.boardSize || 15;
  const board = Array.from({ length: size }, () => Array(size).fill(0));
  for (const m of moves) {
    board[m.y][m.x] = m.color;
  }

  const dirs = [
    { dx: 1, dy: 0, type: 'horizontal' },
    { dx: 0, dy: 1, type: 'vertical' },
    { dx: 1, dy: 1, type: 'diagonal' },
    { dx: 1, dy: -1, type: 'diagonal' },
  ];

  for (const { dx, dy, type } of dirs) {
    let count = 1;
    for (let i = 1; i < 6; i++) {
      const nx = lastMove.x + dx * i, ny = lastMove.y + dy * i;
      if (nx < 0 || nx >= size || ny < 0 || ny >= size) break;
      if (board[ny][nx] !== winColor) break;
      count++;
    }
    for (let i = 1; i < 6; i++) {
      const nx = lastMove.x - dx * i, ny = lastMove.y - dy * i;
      if (nx < 0 || nx >= size || ny < 0 || ny >= size) break;
      if (board[ny][nx] !== winColor) break;
      count++;
    }
    if (count >= 5) return type;
  }
  return null;
}

function countAttackVsDefense(moves, userColor, size) {
  if (!moves || moves.length === 0) return { attack: 0, defense: 0 };

  const board = Array.from({ length: size }, () => Array(size).fill(0));
  let attack = 0, defense = 0;

  for (const move of moves) {
    if (move.color !== userColor) {
      board[move.y][move.x] = move.color;
      continue;
    }
    let myAdj = 0, oppAdj = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = move.x + dx, ny = move.y + dy;
        if (nx < 0 || nx >= size || ny < 0 || ny >= size) continue;
        if (board[ny][nx] === userColor) myAdj++;
        else if (board[ny][nx] !== 0) oppAdj++;
      }
    }
    if (myAdj > oppAdj) attack++;
    else if (oppAdj > myAdj) defense++;
    else attack += 0.5;
    board[move.y][move.x] = move.color;
  }
  return { attack, defense };
}
// =======================================================================
// 적응형 난이도 추천 (B-3)
// =======================================================================

const MIN_GAMES_FOR_RECOMMEND = 5;
const RECENT_WINDOW_FOR_RECOMMEND = 5;

export function computeLevelRecommendation(games, currentLevel, statsByLevel) {
  const realGames = games.filter(
    g => g.mode === 'pvc' && g.practiceMode === false
  );

  if (realGames.length < MIN_GAMES_FOR_RECOMMEND) {
    return {
      enoughData: false,
      have: realGames.length,
      need: MIN_GAMES_FOR_RECOMMEND,
    };
  }

  const sorted = [...realGames].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  const recent = sorted.slice(0, RECENT_WINDOW_FOR_RECOMMEND);
  const recentWins = recent.filter(g => g.userWon === true).length;
  const recentRate = recentWins / recent.length;

  const currentLevelGames = realGames.filter(g => g.aiLevel === currentLevel);
  let currentLevelRate = null;
  if (currentLevelGames.length >= 3) {
    const cWins = currentLevelGames.filter(g => g.userWon === true).length;
    currentLevelRate = cWins / currentLevelGames.length;
  }

  const rate = currentLevelRate !== null ? currentLevelRate : recentRate;

  let suggestion = null;
  let reason = null;

  if (rate >= 0.65 && currentLevel < 5) {
    suggestion = currentLevel + 1;
    if (currentLevelRate !== null) {
      reason = `Lv${currentLevel}에서 승률 ${Math.round(rate * 100)}%로 안정적이에요. Lv${suggestion}도 도전해보세요!`;
    } else {
      reason = `최근 ${recent.length}판 승률 ${Math.round(rate * 100)}%로 좋아요. Lv${suggestion}도 도전해보세요!`;
    }
  } else if (rate <= 0.30 && currentLevel > 1) {
    suggestion = currentLevel - 1;
    if (currentLevelRate !== null) {
      reason = `Lv${currentLevel}이 좀 어려운 것 같아요. Lv${suggestion}부터 차근차근 어떨까요?`;
    } else {
      reason = `최근 승률이 낮아요. Lv${suggestion}부터 차근차근 어떨까요?`;
    }
  } else {
    suggestion = currentLevel;
    reason = `Lv${currentLevel}이 지금 실력에 잘 맞아요.`;
  }

  return {
    enoughData: true,
    suggestion,
    reason,
    recentRate,
    currentLevelRate,
    recentGames: recent.length,
    currentLevelGames: currentLevelGames.length,
  };
}
