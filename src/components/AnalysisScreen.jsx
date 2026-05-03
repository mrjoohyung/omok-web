import React, { useState, useEffect, useCallback } from 'react';
import {
  loadStats, listRecentGames, loadFamilyStats,
  deleteGame, deleteGamesByLabel, deleteAllGames, deleteAccount,
} from '../firebase/store.js';
import { LEVEL_CONFIG } from '../game/ai.js';

export default function AnalysisScreen({ user, onBack, onAccountDeleted }) {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [aiByLevel, setAiByLevel] = useState(null);
  const [familyStats, setFamilyStats] = useState([]);
  const [recentGames, setRecentGames] = useState([]);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, g, fs] = await Promise.all([
        loadStats(user),
        listRecentGames(user, 30),
        loadFamilyStats(user),
      ]);
      setStats(s.stats);
      setAiByLevel(s.aiStatsByLevel);
      setRecentGames(g);
      setFamilyStats(fs);
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
    } catch (e) {
      alert('삭제 실패: ' + e.message);
    }
  };

  const handleDeleteByLabel = async (labelId, labelName) => {
    if (!confirm(`"${labelName}" 와의 모든 PvP 게임을 삭제하시겠어요?\n통계도 함께 보정됩니다.`)) return;
    try {
      const count = await deleteGamesByLabel(user, labelId);
      alert(`${count}개 게임이 삭제되었습니다.`);
      await refresh();
    } catch (e) {
      alert('삭제 실패: ' + e.message);
    }
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

  const aiTotal = (stats?.ai?.asBlack?.total || 0) + (stats?.ai?.asWhite?.total || 0);
  const aiWins = (stats?.ai?.asBlack?.wins || 0) + (stats?.ai?.asWhite?.wins || 0);
  const aiLosses = (stats?.ai?.asBlack?.losses || 0) + (stats?.ai?.asWhite?.losses || 0);
  const aiDraws = (stats?.ai?.asBlack?.draws || 0) + (stats?.ai?.asWhite?.draws || 0);
  const pvpTotal = stats?.pvp?.total || 0;
  const grandTotal = aiTotal + pvpTotal;

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

      <div className="panel">
        <h2>전체 요약</h2>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: 14, color: 'var(--fg)' }}>
          <SummaryItem label="총 게임" value={`${grandTotal}판`} />
          <SummaryItem label="AI 대전" value={`${aiTotal}판`} sub={`${aiWins}승 ${aiLosses}패 ${aiDraws}무`} />
          <SummaryItem label="2인용" value={`${pvpTotal}판`} />
        </div>
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
              const slot = aiByLevel?.[lv] || { asBlack: {}, asWhite: {} };
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
            아직 2인용 기록이 없습니다. 메뉴에서 가족 명단을 등록한 후 "사용자 정보로" 모드로 두면 여기에 쌓입니다.
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
    info = `AI Lv${game.aiLevel} (${modeLabel}, ${styleLabel}) · 나(${colorLabel}) · ${result}`;
  } else {
    const blackName = game.blackLabelName || '익명';
    const whiteName = game.whiteLabelName || '익명';
    let result;
    if (game.winner === 'draw') result = '무승부';
    else if (game.winner === 'black') result = `${blackName} 승`;
    else result = `${whiteName} 승`;
    info = `2인용 · ${blackName}(흑) vs ${whiteName}(백) · ${result}`;
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
    } catch (e) {
      alert('실패: ' + e.message);
    } finally {
      setBusy(false);
    }
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
          type="text"
          value={confirmText}
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
