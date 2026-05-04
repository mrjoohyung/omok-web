import React, { useState, useEffect, useRef } from 'react';
import { ref, onValue, off, query, limitToLast } from 'firebase/database';
import { rtdb } from '../firebase/config.js';
import { sendChatMessage } from '../firebase/online.js';

const EMOJIS = ['👍', '😄', '😱', '🤔', '🎉'];
const MIN_INTERVAL_MS = 1000;

export default function ChatPanel({
  roomCode, user, opponentLabelName,
  chatEnabled, emojiEnabled,
  expanded, onToggleExpand,
}) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [lastSentAt, setLastSentAt] = useState(0);
  const [error, setError] = useState(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    const chatRef = query(ref(rtdb, `rooms/${roomCode}/chat`), limitToLast(100));
    const handler = onValue(chatRef, (snap) => {
      if (!snap.exists()) {
        setMessages([]);
        return;
      }
      const list = [];
      snap.forEach(child => {
        list.push({ id: child.key, ...child.val() });
      });
      list.sort((a, b) => (a.ts || 0) - (b.ts || 0));
      setMessages(list);
    });
    return () => off(chatRef, 'value', handler);
  }, [roomCode]);

  useEffect(() => {
    if (expanded && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, expanded]);

  const handleSend = async () => {
    if (!chatEnabled) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    if (Date.now() - lastSentAt < MIN_INTERVAL_MS) {
      setError('너무 빨리 보내셨어요. 잠깐만 기다려주세요.');
      setTimeout(() => setError(null), 2000);
      return;
    }
    try {
      await sendChatMessage({
        roomCode,
        senderUid: user.uid,
        kind: 'text',
        content: trimmed.slice(0, 100),
      });
      setText('');
      setLastSentAt(Date.now());
    } catch (e) {
      setError('전송 실패');
    }
  };

  const handleEmoji = async (emoji) => {
    if (!emojiEnabled) return;
    if (Date.now() - lastSentAt < MIN_INTERVAL_MS) return;
    try {
      await sendChatMessage({
        roomCode,
        senderUid: user.uid,
        kind: 'emoji',
        content: emoji,
      });
      setLastSentAt(Date.now());
    } catch (e) {}
  };

  if (!chatEnabled && !emojiEnabled) return null;

  if (!expanded) {
    return (
      <button
        onClick={onToggleExpand}
        style={{
          padding: '8px 14px',
          background: 'var(--bg-2)',
          color: 'var(--fg)',
          border: '1px solid var(--border)',
          borderRadius: 3,
          fontSize: 12,
          fontFamily: 'JetBrains Mono, monospace',
          letterSpacing: '0.06em',
          cursor: 'pointer',
        }}
      >
        💬 채팅 펼치기 ({messages.length})
      </button>
    );
  }

  return (
    <div className="chat-panel">
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '8px 12px', borderBottom: '1px solid var(--border)',
      }}>
        <span style={{ fontSize: 12, color: 'var(--fg-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
          💬 채팅
        </span>
        <button onClick={onToggleExpand} style={{
          background: 'transparent', border: 'none', color: 'var(--fg-muted)',
          fontSize: 14, cursor: 'pointer', padding: '2px 8px',
        }}>×</button>
      </div>

      <div ref={scrollRef} className="chat-messages">
        {messages.length === 0 ? (
          <p style={{ fontSize: 12, color: 'var(--fg-muted)', textAlign: 'center', padding: '20px 8px' }}>
            아직 메시지가 없습니다.
          </p>
        ) : (
          messages.map(m => {
            const isMe = m.senderUid === user.uid;
            const senderLabel = isMe ? '나' : opponentLabelName;
            return (
              <div key={m.id} style={{
                fontSize: 13,
                color: 'var(--fg)',
                lineHeight: 1.5,
                padding: '4px 0',
                wordBreak: 'break-word',
              }}>
                <span style={{
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: 11,
                  color: isMe ? 'var(--accent)' : 'var(--fg-muted)',
                  marginRight: 6,
                }}>
                  [{senderLabel}]
                </span>
                {m.kind === 'emoji' ? (
                  <span style={{ fontSize: 22 }}>{m.content}</span>
                ) : (
                  <span>{m.content}</span>
                )}
              </div>
            );
          })
        )}
      </div>

      {emojiEnabled && (
        <div style={{
          display: 'flex', gap: 4, padding: '6px 8px',
          borderTop: '1px solid var(--border)',
        }}>
          {EMOJIS.map(e => (
            <button
              key={e}
              onClick={() => handleEmoji(e)}
              style={{
                flex: 1, fontSize: 18, padding: '6px 0',
                background: 'var(--bg-2)', border: '1px solid var(--border)',
                borderRadius: 3, cursor: 'pointer',
              }}
            >
              {e}
            </button>
          ))}
        </div>
      )}

      {chatEnabled && (
        <div style={{
          display: 'flex', gap: 6, padding: '6px 8px',
          borderTop: '1px solid var(--border)',
        }}>
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 100))}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSend(); }}
            placeholder="메시지 입력 (최대 100자)"
            maxLength={100}
            style={{
              flex: 1, padding: '6px 10px', fontSize: 13,
              background: 'var(--bg-2)', color: 'var(--fg)',
              border: '1px solid var(--border)', borderRadius: 3,
              fontFamily: 'inherit',
            }}
          />
          <button
            onClick={handleSend}
            style={{
              padding: '6px 14px', fontSize: 12,
              background: 'var(--accent)', color: 'var(--bg)',
              border: 'none', borderRadius: 3,
              fontFamily: 'JetBrains Mono, monospace',
              cursor: 'pointer',
            }}
          >
            전송
          </button>
        </div>
      )}

      {error && (
        <p style={{ fontSize: 11, color: '#e74c3c', textAlign: 'center', padding: '4px 8px' }}>
          {error}
        </p>
      )}
    </div>
  );
}
