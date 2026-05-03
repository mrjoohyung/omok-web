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
