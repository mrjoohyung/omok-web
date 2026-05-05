import React, { useState, useEffect, useCallback } from 'react';
import {
  loadStats, listRecentGames, loadFamilyStats,
  deleteGame, deleteGamesByLabel, deleteAllGames, deleteAccount,
} from '../firebase/store.js';
import { LEVEL_CONFIG } from '../game/ai.js';
import { computeStrengths, computeTrendSeries, computeRecentChange, computePlayerPattern } from '../game/analytics.js';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

export default function AnalysisScreen({ user, onBack, onAccountDeleted }) {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [aiByLevel, setAiByLevel] = useState(null);
  const [familyStats, setFamilyStats] = useState([]);
  const [recentGames, setRecentGames] = useState([]);
  const [allGamesForChart, setAllGamesForChart] = useState([]);
  const [showStatsInfo, setShowStatsInfo] = useState(false);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, recent, fs, allGames] = await Promise.all([
        loadStats(user),
        listRecentGames(user, 30),
        loadFamilyStats(user),
        listRecentGames(user, 1000),
      ]);
      setStats(s.stats);
      setAiByLevel(s.aiStatsByLevel);
      setRecentGames(recent);
      setFamilyStats(fs);
      setAllGamesForChart(allGames);
    } catch (e) {
      console.error(e);
      setError('데이터를 불러오지 못했습니다: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  const handleDeleteGame = async (gameId) => {
    if (!confirm('이 게임을 삭제하시겠어요? 통계도 함께 보정됩니다.')) return;
    try {
      await deleteGame(user, gameId);
      await refresh();
    } catch (e) { alert('삭제 실패: ' + e.message); }
  };

  const handleDeleteByLabel = async (labelId, labelName) => {
    if (!confirm(`"${labelName}" 와의 모든 PvP 게임을 삭제하시겠어요?\n통계도 함께 보정됩니다.`)) return;
    try {
      const count = await deleteGamesByLabel(user, labelId);
      alert(`${count}개 게임이 삭제되었습니다.`);
      await refresh();
    } catch (e) { alert('삭제 실패: ' + e.message); }
  };

  if (loading) {
    return (
      <div className="app-shell">
        <div className="title">
          <span>Omok</span>
          <span className="han">五目</span>
        </div>
        <div className="subtitle">— 분석 / 전적 —</div>
        <div className="panel">
          <p style={{ color: 'var(--fg-muted)', fontSize: 14, textAlign: 'center', padding: 20 }}>
            데이터 불러오는 중…
          </p>
        </div>
      </div>
    );
  }

 // stats가 stale일 수 있으니 게임 기록에서 직접 계산
  const aiGames = allGamesForChart.filter(g => g.mode === 'pvc');
  const pvpGames = allGamesForChart.filter(g => g.mode === 'pvp');
  const aiTotal = aiGames.length;
  const aiWins = aiGames.filter(g => g.userWon === true).length;
  const aiLosses = aiGames.filter(g => g.userWon === false && g.winner !== 'draw').length;
  const aiDraws = aiGames.filter(g => g.winner === 'draw').length;
  const pvpTotal = pvpGames.length;
  const grandTotal = aiTotal + pvpTotal;

  // 단계별 AI 통계도 직접 계산 (aiByLevel 캐시 대체)
  const aiByLevelComputed = (() => {
    const out = {};
    for (let lv = 1; lv <= 5; lv++) {
      const lvGames = aiGames.filter(g => g.aiLevel === lv);
      const slot = {
        asBlack: { wins: 0, losses: 0, draws: 0, total: 0 },
        asWhite: { wins: 0, losses: 0, draws: 0, total: 0 },
      };
      for (const g of lvGames) {
        const colorKey = g.userColor === 'white' ? 'asWhite' : 'asBlack';
        slot[colorKey].total++;
        if (g.winner === 'draw') slot[colorKey].draws++;
        else if (g.userWon) slot[colorKey].wins++;
        else slot[colorKey].losses++;
      }
      out[lv] = slot;
    }
    return out;
  })();

  const strengthAnalysis = computeStrengths(allGamesForChart, { asBlack: aiGames.filter(g=>g.userColor!=='white').reduce((acc,g)=>{acc.total++;if(g.winner==='draw')acc.draws++;else if(g.userWon)acc.wins++;else acc.losses++;return acc;},{wins:0,losses:0,draws:0,total:0}), asWhite: aiGames.filter(g=>g.userColor==='white').reduce((acc,g)=>{acc.total++;if(g.winner==='draw')acc.draws++;else if(g.userWon)acc.wins++;else acc.losses++;return acc;},{wins:0,losses:0,draws:0,total:0}) }, aiByLevelComputed);
  const playerPattern = computePlayerPattern(allGamesForChart);
  const trendSeries = computeTrendSeries(allGamesForChart, 5);
  const recentChange = computeRecentChange(trendSeries, 5);
  return (
    <div className="app-shell">
      <div className="title">
        <span>Omok</span>
        <span className="han">五目</span>
      </div>
      <div className="subtitle">— 분석 / 전적 —</div>

      {error && (
        <div className="panel" style={{ borderColor: '#e74c3c' }}>
          <p style={{ fontSize: 13, color: '#e74c3c' }}>{error}</p>
        </div>
      )}

      {/* === 전체 요약 === */}
      <div className="panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>전체 요약</h2>
          <button
            onClick={() => setShowStatsInfo(true)}
            style={{
              background: 'transparent',
              border: '1px solid var(--border)',
              color: 'var(--fg-muted)',
              borderRadius: '50%',
              width: 24, height: 24,
              fontSize: 13,
              cursor: 'pointer',
              fontFamily: 'JetBrains Mono, monospace',
            }}
            title="어떤 게임이 통계에 반영되는지 보기"
          >
            i
          </button>
        </div>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: 14, color: 'var(--fg)', marginTop: 16 }}>
          <SummaryItem label="총 게임" value={`${grandTotal}판`} />
          <SummaryItem label="AI 대전" value={`${aiTotal}판`} sub={`${aiWins}승 ${aiLosses}패 ${aiDraws}무`} />
          <SummaryItem label="2인용" value={`${pvpTotal}판`} />
        </div>
      </div>

      {/* 통계 설명 모달 */}
      {showStatsInfo && (
        <div className="modal-backdrop" onClick={() => setShowStatsInfo(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>통계 반영 기준</h3>
            <div style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--fg)' }}>
              <p style={{ marginBottom: 10 }}><b>✅ 통계에 반영되는 게임</b></p>
              <ul style={{ paddingLeft: 18, marginBottom: 14 }}>
                <li>AI 대전 (모든 레벨, 연습/실전 모두)</li>
                <li>2인용 — "통계 반영" 모드로 시작한 게임</li>
                <li>온라인 대국 — 정상 종료 (승부, 항복, 5목, 무승부)</li>
              </ul>
              <p style={{ marginBottom: 10 }}><b>❌ 반영되지 않는 게임</b></p>
              <ul style={{ paddingLeft: 18, marginBottom: 14 }}>
                <li>2인용 — "게스트 플레이" 모드로 시작한 게임</li>
                <li>온라인 — 3분 끊김 타임아웃으로 종료된 게임</li>
                <li>아직 끝나지 않은 진행 중 게임</li>
              </ul>
              <p style={{ marginBottom: 10 }}><b>📊 분석 항목별 최소 게임</b></p>
              <ul style={{ paddingLeft: 18 }}>
                <li>강점 & 약점: 5판 이상</li>
                <li>실력 추세 그래프: 5판 이상</li>
                <li>플레이 패턴 (방향 약점 등): 20판 이상</li>
                <li>적응형 난이도 추천: 실전 모드 5판 이상</li>
              </ul>
            </div>
            <div className="modal-actions">
              <button className="primary-btn" onClick={() => setShowStatsInfo(false)}>확인</button>
            </div>
          </div>
        </div>
      )}

      <div className="panel">
        <h2>강점 & 약점</h2>
        <p style={{ fontSize: 11, color: 'var(--fg-muted)', fontFamily: 'JetBrains Mono, monospace', marginBottom: 14 }}>
          AI 대전 결과 기반 분석 (5판 이상부터 분석)
        </p>
        {!strengthAnalysis.enoughData ? (
          <p style={{ color: 'var(--fg-muted)', fontSize: 13, padding: '8px 0' }}>
            아직 분석할 데이터가 부족합니다. AI 대전 {strengthAnalysis.need}판 이상이 필요해요.
            <br/>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>
              현재 {strengthAnalysis.have}/{strengthAnalysis.need}판
            </span>
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {strengthAnalysis.strengths.length > 0 && (
              <div>
                <div style={{ fontSize: 12, color: 'var(--fg-muted)', fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.06em', marginBottom: 8 }}>💪 강점</div>
                <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {strengthAnalysis.strengths.map((s, i) => (
                    <li key={i} style={{ fontSize: 13, color: 'var(--fg)', padding: '8px 12px', background: 'var(--bg-2)', borderLeft: '3px solid #4caf50', borderRadius: 3, lineHeight: 1.5 }}>
                      {s.text}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {strengthAnalysis.weaknesses.length > 0 && (
              <div>
                <div style={{ fontSize: 12, color: 'var(--fg-muted)', fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.06em', marginBottom: 8 }}>⚠ 약점</div>
                <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {strengthAnalysis.weaknesses.map((w, i) => (
                    <li key={i} style={{ fontSize: 13, color: 'var(--fg)', padding: '8px 12px', background: 'var(--bg-2)', borderLeft: '3px solid #e74c3c', borderRadius: 3, lineHeight: 1.5 }}>
                      {w.text}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {strengthAnalysis.strengths.length === 0 && strengthAnalysis.weaknesses.length === 0 && (
              <p style={{ color: 'var(--fg-muted)', fontSize: 13 }}>
                특별한 강점이나 약점이 두드러지지 않습니다. 균형 있게 두고 계시네요.
              </p>
            )}
          </div>
        )}
      </div>
      {/* === 플레이 패턴 === */}
      <div className="panel">
        <h2>플레이 패턴</h2>
        <p style={{ fontSize: 11, color: 'var(--fg-muted)', fontFamily: 'JetBrains Mono, monospace', marginBottom: 14 }}>
          최근 AI 대전 분석 (20판 이상 시 정확도 ↑)
        </p>
        <PatternSection pattern={playerPattern} />
      </div>

      {/* === 추세 그래프 === */}
      <div className="panel">
        <h2>실력 추세</h2>
        <p style={{ fontSize: 11, color: 'var(--fg-muted)', fontFamily: 'JetBrains Mono, monospace', marginBottom: 14 }}>
          AI 대전 승률 변화 (전체 평균 vs 최근 5판)
        </p>
        {trendSeries.length < 5 ? (
          <p style={{ color: 'var(--fg-muted)', fontSize: 13, padding: '8px 0' }}>
            그래프를 그리려면 AI 대전 5판 이상이 필요합니다.
            <br/>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>
              현재 {allGamesForChart.filter(g => g.mode === 'pvc').length}/5판
            </span>
          </p>
        ) : (
          <>
            <div style={{ width: '100%', height: 260, marginBottom: 12 }}>
              <ResponsiveContainer>
                <LineChart data={trendSeries} margin={{ top: 8, right: 16, left: -16, bottom: 4 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="idx"
                    stroke="var(--fg-muted)"
                    tick={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}
                  />
                  <YAxis
                    domain={[0, 100]}
                    stroke="var(--fg-muted)"
                    tick={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--bg-2)',
                      border: '1px solid var(--border)',
                      borderRadius: 3,
                      fontSize: 12,
                    }}
                    labelStyle={{ color: 'var(--fg)' }}
                    formatter={(value, name) => {
                      if (value === null || value === undefined) return ['—', name];
                      return [`${value}%`, name];
                    }}
                    labelFormatter={(idx) => `${idx}번째 게임`}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line
                    type="monotone"
                    dataKey="cumulative"
                    name="전체 평균"
                    stroke="var(--accent)"
                    strokeWidth={2.5}
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="recent5"
                    name="최근 5판"
                    stroke="var(--last-mark)"
                    strokeWidth={1.5}
                    dot={{ r: 2 }}
                    isAnimationActive={false}
                    connectNulls={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            {recentChange && (
              <div style={{
                fontSize: 13, color: 'var(--fg)', padding: '10px 14px',
                background: 'var(--bg-2)', borderRadius: 3,
                fontFamily: 'JetBrains Mono, monospace',
                display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
              }}>
                <span style={{ color: 'var(--fg-muted)', fontSize: 11 }}>현재 추세:</span>
                <span style={{ color: 'var(--accent)' }}>{recentChange.trend}</span>
                <span style={{ color: 'var(--fg-muted)', fontSize: 11, marginLeft: 'auto' }}>
                  {recentChange.prev}% → {recentChange.current}% ({recentChange.diff > 0 ? '+' : ''}{recentChange.diff}%p)
                </span>
              </div>
            )}
          </>
        )}
      </div>

      <div className="panel">
        <h2>AI 대전 통계</h2>
        {aiTotal === 0 ? (
          <p style={{ color: 'var(--fg-muted)', fontSize: 13, padding: '12px 0', textAlign: 'center' }}>
            아직 AI 대전 기록이 없습니다.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[1, 2, 3, 4, 5].map(lv => {
              const slot = aiByLevelComputed[lv] || { asBlack: {}, asWhite: {} };
              const b = slot.asBlack || {};
              const w = slot.asWhite || {};
              const total = (b.wins || 0) + (b.losses || 0) + (b.draws || 0)
                + (w.wins || 0) + (w.losses || 0) + (w.draws || 0);
              const wins = (b.wins || 0) + (w.wins || 0);
              const winRate = total > 0 ? Math.round((wins / total) * 100) : null;
              const cfg = LEVEL_CONFIG[lv];

              if (total === 0) return (
                <div key={lv} style={cardStyle()}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--fg)' }}>
                      Lv{lv} <span style={{ fontSize: 11, color: 'var(--fg-muted)', fontFamily: 'JetBrains Mono, monospace', marginLeft: 6 }}>{cfg?.label}</span>
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--fg-muted)', fontFamily: 'JetBrains Mono, monospace' }}>기록 없음</span>
                  </div>
                </div>
              );

              return (
                <div key={lv} style={cardStyle()}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--fg)' }}>
                      Lv{lv} <span style={{ fontSize: 11, color: 'var(--fg-muted)', fontFamily: 'JetBrains Mono, monospace', marginLeft: 6 }}>{cfg?.label}</span>
                    </span>
                    <span style={{ fontSize: 13, color: 'var(--accent)', fontFamily: 'JetBrains Mono, monospace' }}>
                      {total}판 · 승률 {winRate}%
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 18, fontSize: 12, fontFamily: 'JetBrains Mono, monospace' }}>
                    <ColorRow color="black" wins={b.wins||0} losses={b.losses||0} draws={b.draws||0} />
                    <ColorRow color="white" wins={w.wins||0} losses={w.losses||0} draws={w.draws||0} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="panel">
        <h2>2인용 — 상대별 전적</h2>
        {familyStats.length === 0 ? (
          <p style={{ color: 'var(--fg-muted)', fontSize: 13, padding: '12px 0', textAlign: 'center' }}>
            아직 2인용 기록이 없습니다.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {familyStats.map(f => {
              const wins = f.asBlack.wins + f.asWhite.wins;
              const winRate = f.total > 0 ? Math.round((wins / f.total) * 100) : 0;
              return (
                <div key={f.id} style={cardStyle()}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                    <span style={{ fontSize: 15, fontWeight: 500, color: 'var(--fg)' }}>{f.name}</span>
                    <span style={{ fontSize: 12, color: 'var(--accent)', fontFamily: 'JetBrains Mono, monospace' }}>
                      {f.total}판 · 승률 {winRate}%
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 18, fontSize: 12, fontFamily: 'JetBrains Mono, monospace', marginBottom: 10 }}>
                    <ColorRow color="black" prefix="흑일 때" wins={f.asBlack.wins} losses={f.asBlack.losses} draws={f.asBlack.draws} />
                    <ColorRow color="white" prefix="백일 때" wins={f.asWhite.wins} losses={f.asWhite.losses} draws={f.asWhite.draws} />
                  </div>
                  <button onClick={() => handleDeleteByLabel(f.id, f.name)} style={smallDangerBtnStyle}>
                    이 라벨 게임 모두 삭제
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="panel">
        <h2>최근 게임 (최근 30개)</h2>
        {recentGames.length === 0 ? (
          <p style={{ color: 'var(--fg-muted)', fontSize: 13, padding: '12px 0', textAlign: 'center' }}>
            아직 게임 기록이 없습니다.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {recentGames.map(g => (
              <RecentGameRow key={g.id} game={g} onDelete={() => handleDeleteGame(g.id)} />
            ))}
          </div>
        )}
      </div>

      <div className="panel" style={{ borderColor: '#e74c3c' }}>
        <h2 style={{ color: '#e74c3c' }}>위험 영역</h2>
        <DangerActions user={user} onAfterReset={refresh} onAccountDeleted={onAccountDeleted} />
      </div>

      <button className="secondary-btn" onClick={onBack}>← 메뉴로</button>

      <div className="footer">analysis · v0.3</div>
    </div>
  );
}

function SummaryItem({ label, value, sub }) {
  return (
    <div style={{ flex: 1, minWidth: 110 }}>
      <div style={{ fontSize: 11, color: 'var(--fg-muted)', fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, color: 'var(--fg)', fontWeight: 500, fontFamily: 'var(--display-font)' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--fg-muted)', fontFamily: 'JetBrains Mono, monospace', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function ColorRow({ color, prefix, wins, losses, draws }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{
        display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
        background: color === 'black' ? 'var(--stone-black)' : 'var(--stone-white)',
        border: '1px solid var(--board-line)',
      }} />
      <span style={{ color: 'var(--fg-muted)' }}>
        {prefix ? `${prefix}: ` : ''}
        <span style={{ color: 'var(--fg)' }}>{wins}승 {losses}패{draws ? ` ${draws}무` : ''}</span>
      </span>
    </div>
  );
}

function RecentGameRow({ game, onDelete }) {
  const date = new Date(game.timestamp);
  const dateStr = `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;

  let info;
  if (game.mode === 'pvc') {
    const styleLabel = game.aiStyle === 'attack' ? '공격' : game.aiStyle === 'defense' ? '방어' : '균형';
    const modeLabel = game.practiceMode ? '연습' : '실전';
    const colorLabel = game.userColor === 'white' ? '백' : '흑';
    let result;
    if (game.winner === 'draw') result = '무';
    else if (game.userWon) result = '승';
    else result = '패';
    info = `🤖 AI Lv${game.aiLevel} (${modeLabel}, ${styleLabel}) · 나(${colorLabel}) · ${result}`;
  } else {
    const blackName = game.blackLabelName || '익명';
    const whiteName = game.whiteLabelName || '익명';
    let result;
    if (game.winner === 'draw') result = '무승부';
    else if (game.winner === 'black') result = `${blackName} 승`;
    else result = `${whiteName} 승`;
    const modePrefix = game.isOnline ? '🌐 온라인' : '👥 2인용';
    info = `${modePrefix} · ${blackName}(흑) vs ${whiteName}(백) · ${result}`;
  }

  const moveCount = game.moves?.length || 0;
  const sizeLabel = game.boardSize ? `${game.boardSize}×${game.boardSize}` : '';

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '8px 12px', background: 'var(--bg-2)',
      border: '1px solid var(--border)', borderRadius: 3,
      fontSize: 12, fontFamily: 'JetBrains Mono, monospace',
    }}>
      <span style={{ color: 'var(--fg-muted)', flexShrink: 0 }}>{dateStr}</span>
      <span style={{ color: 'var(--fg)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {info}
      </span>
      <span style={{ color: 'var(--fg-muted)', flexShrink: 0 }}>{moveCount}수 · {sizeLabel}</span>
      <button onClick={onDelete} style={tinyDangerBtnStyle}>삭제</button>
    </div>
  );
}

function DangerActions({ user, onAfterReset, onAccountDeleted }) {
  const [resetMode, setResetMode] = useState(null);
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);

  const startConfirm = (mode) => { setResetMode(mode); setConfirmText(''); };
  const cancel = () => { setResetMode(null); setConfirmText(''); };

  const execute = async () => {
    setBusy(true);
    try {
      if (resetMode === 'all') {
        await deleteAllGames(user);
        alert('모든 게임 기록이 삭제되었습니다.');
        cancel();
        if (onAfterReset) await onAfterReset();
      } else if (resetMode === 'account') {
        await deleteAccount(user);
        alert('계정이 삭제되었습니다. 로그아웃됩니다.');
        if (onAccountDeleted) onAccountDeleted();
      }
    } catch (e) { alert('실패: ' + e.message); }
    finally { setBusy(false); }
  };

  if (resetMode) {
    const need = '삭제';
    const valid = confirmText === need;
    return (
      <div style={{ padding: 4 }}>
        <p style={{ fontSize: 14, color: 'var(--fg)', marginBottom: 12, lineHeight: 1.6 }}>
          {resetMode === 'all'
            ? '⚠ 모든 게임 기록과 통계를 삭제합니다. 가족 명단은 유지됩니다.'
            : '⚠ 계정의 모든 데이터(게임, 통계, 가족 명단)를 삭제하고 로그아웃됩니다.'}
        </p>
        <p style={{ fontSize: 13, color: 'var(--fg-muted)', marginBottom: 8 }}>
          확인을 위해 아래 입력란에 <b style={{ color: 'var(--fg)' }}>{need}</b> 라고 입력하세요:
        </p>
        <input
          type="text" value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder={need}
          style={{
            padding: '8px 12px', fontSize: 14, width: '100%', maxWidth: 200,
            background: 'var(--bg-2)', color: 'var(--fg)',
            border: '1px solid var(--border)', borderRadius: 3,
            fontFamily: 'inherit', marginBottom: 12,
          }}
        />
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="secondary-btn" onClick={cancel} disabled={busy}>취소</button>
          <button onClick={execute} disabled={!valid || busy}
            style={{
              padding: '8px 16px', fontSize: 12, letterSpacing: '0.08em',
              textTransform: 'uppercase', fontFamily: 'JetBrains Mono, monospace',
              background: valid && !busy ? '#e74c3c' : 'var(--bg-2)',
              color: valid && !busy ? '#fff' : 'var(--fg-muted)',
              border: '1px solid #e74c3c', borderRadius: 3,
              cursor: valid && !busy ? 'pointer' : 'not-allowed',
            }}>
            {busy ? '진행 중…' : '삭제 실행'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <button onClick={() => startConfirm('all')} style={dangerBtnStyle}>
        모든 게임 기록 삭제
      </button>
      <button onClick={() => startConfirm('account')} style={dangerBtnStyle}>
        계정 삭제 (모든 데이터 + 로그아웃)
      </button>
    </div>
  );
}

function cardStyle() {
  return { padding: '12px 14px', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 3 };
}
const smallDangerBtnStyle = {
  background: 'transparent', border: '1px solid var(--border)', color: 'var(--fg-muted)',
  fontSize: 11, padding: '4px 10px', borderRadius: 3, cursor: 'pointer',
  fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.08em',
};
const tinyDangerBtnStyle = {
  background: 'transparent', border: '1px solid var(--border)', color: 'var(--fg-muted)',
  fontSize: 10, padding: '2px 8px', borderRadius: 2, cursor: 'pointer',
  fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.06em', flexShrink: 0,
};
const dangerBtnStyle = {
  background: 'transparent', border: '1px solid #e74c3c', color: '#e74c3c',
  fontSize: 12, padding: '10px 16px', borderRadius: 3, cursor: 'pointer',
  fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.08em', textTransform: 'uppercase',
};
function pad(n) { return n < 10 ? '0' + n : '' + n; }

function PatternSection({ pattern }) {
  if (!pattern) return null;

  if (!pattern.enoughData) {
    return (
      <p style={{ color: 'var(--fg-muted)', fontSize: 13, padding: '8px 0' }}>
        패턴 분석을 위해 AI 대전 {pattern.need}판 이상이 필요합니다.
        <br/>
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>
          현재 {pattern.have}/{pattern.need}판
        </span>
      </p>
    );
  }

  const dirNames = { horizontal: '가로', vertical: '세로', diagonal: '대각선' };
  const weakDirs = Object.entries(pattern.dirWeights)
    .filter(([k, v]) => v > 1.0)
    .map(([k]) => dirNames[k]);

  const typeText = {
    attacker: '공격형 — 자기 라인 만들기를 더 자주 함',
    defender: '방어형 — 상대 견제를 더 자주 함',
    balanced: '균형형 — 공격과 방어 비율이 비슷함',
  }[pattern.playerType];

  const openingText = {
    center: '중앙 위주 — 첫 수를 보드 중앙 부근에 두는 편',
    outside: '변두리 위주 — 첫 수를 보드 가장자리에 두는 편',
    mixed: '다양 — 첫 수 위치가 매번 다름',
  }[pattern.openingPref];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <PatternRow
        label="플레이 성향"
        value={typeText}
        meta={`공격 ${Math.round(pattern.attackRatio * 100)}% / 방어 ${Math.round((1 - pattern.attackRatio) * 100)}%`}
      />
      <PatternRow
        label="첫 수 패턴"
        value={openingText}
        meta={`중앙 ${Math.round(pattern.centerRatio * 100)}% / 변두리 ${Math.round((1 - pattern.centerRatio) * 100)}%`}
      />
      <PatternRow
        label="방향 약점"
        value={weakDirs.length > 0
          ? `${weakDirs.join(', ')} 방향에서 더 자주 패배`
          : '특정 방향에 치우치지 않음'
        }
        meta={`가로 ${pattern.dirCounts.horizontal} / 세로 ${pattern.dirCounts.vertical} / 대각 ${pattern.dirCounts.diagonal}`}
      />
      <PatternRow
        label="종반 약점"
        value={pattern.endgameWeak
          ? '게임이 길어지면 패배 빈도 증가'
          : '게임 길이와 승패 무관'
        }
        meta={pattern.endgameWeak
          ? `평균 패배 ${Math.round(pattern.avgLossLen)}수 vs 평균 승리 ${Math.round(pattern.avgWinLen)}수`
          : null
        }
      />

      <p style={{ fontSize: 11, color: 'var(--fg-muted)', fontFamily: 'JetBrains Mono, monospace', marginTop: 8, lineHeight: 1.5 }}>
        ℹ Lv1·2 + 약점공략형 모드에서 이 분석을 기반으로 AI가 약점을 의식해 둡니다.
      </p>
    </div>
  );
}

function PatternRow({ label, value, meta }) {
  return (
    <div style={{
      padding: '10px 14px',
      background: 'var(--bg-2)',
      border: '1px solid var(--border)',
      borderRadius: 3,
    }}>
      <div style={{
        fontSize: 11, color: 'var(--fg-muted)',
        fontFamily: 'JetBrains Mono, monospace',
        letterSpacing: '0.06em', marginBottom: 4,
      }}>
        {label}
      </div>
      <div style={{ fontSize: 13, color: 'var(--fg)', lineHeight: 1.5 }}>{value}</div>
      {meta && (
        <div style={{
          fontSize: 11, color: 'var(--fg-muted)',
          fontFamily: 'JetBrains Mono, monospace',
          marginTop: 4,
        }}>
          {meta}
        </div>
      )}
    </div>
  );
}
