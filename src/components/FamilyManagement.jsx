import React, { useState, useEffect } from 'react';
import { listFamily, addFamily, removeFamily } from '../firebase/store.js';

export default function FamilyManagement({ user, onBack }) {
  const [list, setList] = useState([]);
  const [newName, setNewName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const items = await listFamily(user);
      setList(items);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const handleAdd = async () => {
    setError(null);
    try {
      await addFamily(user, newName);
      setNewName('');
      await refresh();
    } catch (e) {
      setError(e.message);
    }
  };

  const handleRemove = async (id, name) => {
    if (!confirm(`"${name}" 을(를) 가족 명단에서 삭제하시겠어요?\n(이 사람과의 기존 게임 기록은 그대로 남고, 분석 탭에서 라벨별 삭제로 따로 지우실 수 있습니다.)`)) return;
    setError(null);
    try {
      await removeFamily(user, id);
      await refresh();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="app-shell">
      <div className="title">
        <span>Omok</span>
        <span className="han">五目</span>
      </div>
      <div className="subtitle">— family roster —</div>

      <div className="panel">
        <h2>가족 명단</h2>

        <p style={{ fontSize: 13, color: 'var(--fg-muted)', lineHeight: 1.6, marginBottom: 16 }}>
          2인용 게임에서 누구와 두었는지 라벨링할 수 있어요. 라벨별로 전적이 따로 기록됩니다.
          여기 등록되지 않은 사람과 두면 "익명"으로 묶여 저장됩니다.
        </p>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
            placeholder="이름 입력 (예: 아빠, 엄마, 동생)"
            maxLength={20}
            style={{
              flex: 1, padding: '8px 12px', fontSize: 14,
              background: 'var(--bg-2)', color: 'var(--fg)',
              border: '1px solid var(--border)', borderRadius: 3,
              fontFamily: 'inherit',
            }}
          />
          <button className="primary-btn" onClick={handleAdd} style={{ fontSize: 14, padding: '8px 18px' }}>
            추가
          </button>
        </div>

        {error && (
          <p style={{ fontSize: 13, color: '#e74c3c', marginBottom: 12 }}>
            {error}
          </p>
        )}

        {loading ? (
          <p style={{ fontSize: 13, color: 'var(--fg-muted)' }}>로딩 중…</p>
        ) : list.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--fg-muted)', padding: '16px 0', textAlign: 'center' }}>
            아직 등록된 가족이 없습니다.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {list.map(f => (
              <div key={f.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 14px', background: 'var(--bg-2)',
                border: '1px solid var(--border)', borderRadius: 3,
              }}>
                <span style={{ fontSize: 14, color: 'var(--fg)' }}>{f.name}</span>
                <button
                  onClick={() => handleRemove(f.id, f.name)}
                  style={{
                    background: 'transparent', border: '1px solid var(--border)',
                    color: 'var(--fg-muted)', fontSize: 11, padding: '3px 10px',
                    borderRadius: 3, cursor: 'pointer',
                    fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.06em',
                  }}
                >
                  삭제
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="panel" style={{ paddingTop: 16, paddingBottom: 16 }}>
        <p style={{ fontSize: 11, color: 'var(--fg-muted)', lineHeight: 1.6, fontFamily: 'JetBrains Mono, monospace' }}>
          ℹ 개인정보 보호를 위해, 한 기기에서 한 게임 기록을 다른 계정에서 접근할 수 없습니다.
          가족 라벨은 본인 계정 안에서만 의미를 가집니다.
        </p>
      </div>

      <button className="secondary-btn" onClick={onBack}>← 메뉴로</button>

      <div className="footer">family · v0.3</div>
    </div>
  );
}
