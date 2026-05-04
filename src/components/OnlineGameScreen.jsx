import React, { useState, useEffect, useMemo, useRef } from 'react';
import Board from './Board.jsx';
import ChatPanel from './ChatPanel.jsx';
import {
  EMPTY, BLACK, WHITE, createBoard, checkWin, isBoardFull, isForbidden, coordLabel,
} from '../game/gameLogic.js';
import {
  makeMove, endGame, resignGame, leaveRoom,
  requestReplay, acceptReplay, declineReplay,
  updateHeartbeat, forceTerminate, timeoutDraw,
  passTurnOnTimeout,
} from '../firebase/online.js';
import { saveGameResult } from '../firebase/store.js';
import { ref, update, onValue, off } from 'firebase/database';
import { rtdb } from '../firebase/config.js';

const UNDO_TIMEOUT_MS = 10_000;

export default function OnlineGameScreen({
  roomCode, role, user, roomData,
  opponentLabelId, opponentLabelName, onExit,
}) {
  const myColor = useMemo(() => {
    if (role === 'host') return roomData.hostColor === 'white' ? WHITE : BLACK;
    return roomData.hostColor === 'white' ? BLACK : WHITE;
  }, [role, roomData.hostColor]);
  const myColorStr = myColor === BLACK ? 'black' : 'white';
  const oppColorStr = myColorStr === 'black' ? 'white' : 'black';

  const { config } = roomData;
  const { boardSize, renju, allowOverline } = config;

  const board = useMemo(() => {
    const b = createBoard(boardSize);
    const moves = roomData.moves || [];
    for (const m of moves) {
      b[m.y][m.x] = m.color === 'black' ? BLACK : WHITE;
    }
    return b;
  }, [roomData.moves, boardSize]);

  const moves = roomData.moves || [];
  const lastMove = moves.length > 0 ? {
    x: moves[moves.length - 1].x,
    y: moves[moves.length - 1].y,
    color: moves[moves.length - 1].color === 'black' ? BLACK : WHITE,
  } : null;

  const turnStr = roomData.turn;
  const isMyTurn = turnStr === myColorStr;
  const winner = roomData.winner;
  const winReason = roomData.winReason;
  const winningLine = roomData.winningLine;

  // 결과가 났을 때 본인 계정 통계에 저장 (한 번만)
  // 단, winReason === 'timeout' 인 경우 (끊김으로 인한 종료) 통계 미반영
  const [statsSaved, setStatsSaved] = useState(false);
  const [chatExpanded, setChatExpanded] = useState(false);
  useEffect(() => {
    if (!winner) return;
    if (statsSaved) return;
    if (moves.length === 0) return;
    if (winReason === 'timeout') {
      setStatsSaved(true);
      return;
    }

    (async () => {
      try {
        const myLabelId = 'self';
        const blackLabel = (myColorStr === 'black') ? myLabelId : opponentLabelId;
        const whiteLabel = (myColorStr === 'white') ? myLabelId : opponentLabelId;
        const blackLabelName = (myColorStr === 'black') ? user.displayName : opponentLabelName;
        const whiteLabelName = (myColorStr === 'white') ? user.displayName : opponentLabelName;

        const record = {
          mode: 'pvp',
          boardSize, renju, allowOverline,
          winner: winner === 'draw' ? 'draw' : winner,
          winReason,
          moves: moves.map(m => ({
            x: m.x, y: m.y,
            color: m.color === 'black' ? BLACK : WHITE,
          })),
          timestamp: Date.now(),
          blackLabel, whiteLabel,
          blackLabelName, whiteLabelName,
          isOnline: true,
        };
        await saveGameResult(user, record);
      } catch (e) {
        console.warn('통계 저장 실패:', e);
      } finally {
        setStatsSaved(true);
      }
    })();
  }, [winner, statsSaved, moves.length, roomData.hostColor, role, user,
      opponentLabelId, opponentLabelName, myColorStr, boardSize, renju, allowOverline, winReason]);

  const handleCellClick = async (x, y) => {
    if (winner) return;
    if (!isMyTurn) return;
    if (board[y][x] !== EMPTY) return;

    if (renju && myColor === BLACK) {
      const f = isForbidden(board, x, y, BLACK);
      if (f.forbidden) {
        alert('금수 자리입니다. 다른 곳을 선택해 주세요.');
        return;
      }
    }

    const overlineCheckOn = !allowOverline || renju;
    if (overlineCheckOn) {
      const tempBoard = board.map(r => r.slice());
      tempBoard[y][x] = myColor;
      const win = checkWin(tempBoard, x, y, myColor, { allowOverline: renju ? false : allowOverline });
      if (!win.winner) {
        const win6 = checkWin(tempBoard, x, y, myColor, { allowOverline: true });
        if (win6.winner) {
          if (!confirm('이 자리에 두면 6목 이상이 되어 승리로 인정되지 않습니다. 그래도 두시겠어요?')) {
            return;
          }
        }
      }
    }

    const ok = await makeMove({
      roomCode, x, y, color: myColorStr, expectedTurn: turnStr,
    });
    if (!ok) {
      console.warn('수 두기 실패');
      return;
    }

    const newBoard = board.map(r => r.slice());
    newBoard[y][x] = myColor;
    const win = checkWin(newBoard, x, y, myColor, { allowOverline: renju ? false : allowOverline });
    if (win.winner) {
      await endGame({
        roomCode,
        winner: win.winner === BLACK ? 'black' : 'white',
        winReason: 'five',
        winningLine: win.line,
      });
      return;
    }
    if (isBoardFull(newBoard)) {
      await endGame({ roomCode, winner: 'draw', winReason: 'draw', winningLine: null });
      return;
    }
  };

  const handleResign = async () => {
    if (winner) return;
    if (!confirm('정말 항복하시겠어요?')) return;
    await resignGame({ roomCode, byColor: myColorStr });
  };

  const [undoRequest, setUndoRequest] = useState(null);
  useEffect(() => {
    const reqRef = ref(rtdb, `rooms/${roomCode}/undoRequest`);
    const handler = onValue(reqRef, (snap) => {
      setUndoRequest(snap.exists() ? snap.val() : null);
    });
    return () => off(reqRef, 'value', handler);
  }, [roomCode]);

  const [undoCountdown, setUndoCountdown] = useState(null);
  useEffect(() => {
    if (!undoRequest) {
      setUndoCountdown(null);
      return;
    }
    const tick = () => {
      const left = Math.max(0, Math.ceil((undoRequest.expiresAt - Date.now()) / 1000));
      setUndoCountdown(left);
      if (left <= 0) {
        if (role === 'host') {
          (async () => {
            try {
              await update(ref(rtdb, `rooms/${roomCode}`), { undoRequest: null });
            } catch (e) {}
          })();
        }
      }
    };
    tick();
    const interval = setInterval(tick, 200);
    return () => clearInterval(interval);
  }, [undoRequest, role, roomCode]);

  const requestUndo = async () => {
    if (winner) return;
    if (undoRequest) return;
    if (moves.length === 0) return;
    const lastMyIdx = [...moves].reverse().findIndex(m => m.color === myColorStr);
    if (lastMyIdx === -1) return;

    await update(ref(rtdb, `rooms/${roomCode}`), {
      undoRequest: {
        byUid: user.uid,
        byColor: myColorStr,
        requestedAt: Date.now(),
        expiresAt: Date.now() + UNDO_TIMEOUT_MS,
      },
    });
  };

  const cancelMyUndo = async () => {
    await update(ref(rtdb, `rooms/${roomCode}`), { undoRequest: null });
  };

  const acceptUndo = async () => {
    if (!undoRequest) return;
    const newMoves = [...moves];
    for (let i = newMoves.length - 1; i >= 0; i--) {
      if (newMoves[i].color === undoRequest.byColor) {
        newMoves.splice(i, 1);
        break;
      }
    }
    await update(ref(rtdb, `rooms/${roomCode}`), {
      moves: newMoves,
      turn: undoRequest.byColor,
      turnStartedAt: Date.now(),
      undoRequest: null,
    });
  };

  const declineUndo = async () => {
    await update(ref(rtdb, `rooms/${roomCode}`), {
      undoRequest: null,
      undoDeclinedAt: Date.now(),
    });
  };

  const [showDeclineAlert, setShowDeclineAlert] = useState(false);
  const lastUndoCleared = useRef(false);
  useEffect(() => {
    if (undoRequest) {
      lastUndoCleared.current = false;
      return;
    }
    if (!lastUndoCleared.current && roomData.undoDeclinedAt) {
      const recent = Date.now() - roomData.undoDeclinedAt < 3000;
      if (recent) {
        setShowDeclineAlert(true);
        setTimeout(() => setShowDeclineAlert(false), 3000);
      }
      lastUndoCleared.current = true;
    }
  }, [undoRequest, roomData.undoDeclinedAt]);

  const [replayRequested, setReplayRequested] = useState(false);
  const requestReplayHandler = async () => {
    setReplayRequested(true);
    await requestReplay({ roomCode, byUid: user.uid });
  };

  const acceptReplayHandler = async () => {
    await acceptReplay({
      roomCode,
      hostColor: roomData.hostColor,
      config: roomData.config,
    });
    setReplayRequested(false);
  };

  const declineReplayHandler = async () => {
    await declineReplay({ roomCode });
    setTimeout(onExit, 500);
  };

  const handleExit = async () => {
    if (!winner) {
      if (!confirm('정말 게임을 떠나시겠어요? 진행 중인 게임이 종료됩니다.')) return;
      try {
        await leaveRoom({ roomCode, role });
      } catch (e) {}
    }
    onExit();
  };
  // ===== Heartbeat (5초마다 lastActive 갱신) =====
  useEffect(() => {
    if (winner) return;
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      try {
        await updateHeartbeat({ roomCode, role });
      } catch (e) {}
    };
    tick();
    const interval = setInterval(tick, 5000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [roomCode, role, winner]);

  // ===== 끊김 감지 =====
  const TIMEOUT_DISCONNECT_MS = 30_000;
  const TIMEOUT_TERMINATE_MS = 3 * 60_000;

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (winner) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [winner]);

  const opponentLastActive = role === 'host' ? roomData.lastActiveGuest : roomData.lastActiveHost;
  const myLastActive = role === 'host' ? roomData.lastActiveHost : roomData.lastActiveGuest;
  const opponentSilentMs = opponentLastActive ? (now - opponentLastActive) : 0;
  const mySilentMs = myLastActive ? (now - myLastActive) : 0;

  const opponentDisconnected = !winner && opponentLastActive && opponentSilentMs > TIMEOUT_DISCONNECT_MS;
  const bothDisconnected = !winner && opponentDisconnected && mySilentMs > TIMEOUT_DISCONNECT_MS;
  const opponentTimeoutSecondsLeft = Math.max(0,
    Math.ceil((TIMEOUT_TERMINATE_MS - opponentSilentMs) / 1000));
  const canTerminate = opponentDisconnected && opponentSilentMs > TIMEOUT_TERMINATE_MS;

  useEffect(() => {
    if (winner) return;
    if (!bothDisconnected) return;
    if (mySilentMs > TIMEOUT_TERMINATE_MS && opponentSilentMs > TIMEOUT_TERMINATE_MS) {
      timeoutDraw({ roomCode }).catch(() => {});
    }
  }, [bothDisconnected, mySilentMs, opponentSilentMs, winner, roomCode]);

  const handleForceTerminate = async () => {
    if (!confirm(`${opponentLabelName}이 3분간 응답이 없습니다. 게임을 종료하시겠어요?\n(본인 승리 처리, 단 통계에는 반영되지 않습니다.)`)) return;
    await forceTerminate({ roomCode, byColor: myColorStr });
  };

  const formatMMSS = (totalSec) => {
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };
  const formatMMSS = (totalSec) => {
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // ===== 한 수 시간 제한 (5-E2) =====
  const moveTimeLimit = config.timeLimit || 0;
  const turnStartedAt = roomData.turnStartedAt || 0;
  const turnElapsedMs = turnStartedAt ? (now - turnStartedAt) : 0;
  const turnSecondsLeft = moveTimeLimit > 0
    ? Math.max(0, Math.ceil(moveTimeLimit - turnElapsedMs / 1000))
    : null;

  useEffect(() => {
    if (!moveTimeLimit) return;
    if (winner) return;
    if (!turnStartedAt) return;
    if (turnElapsedMs / 1000 < moveTimeLimit) return;
    passTurnOnTimeout({
      roomCode,
      expectedTurn: turnStr,
      expectedTurnStartedAt: turnStartedAt,
    }).catch(() => {});
  }, [moveTimeLimit, winner, turnStartedAt, turnElapsedMs, roomCode, turnStr]);

 // ===== 결과 메시지 =====
  const resultMessage = useMemo(() => {
    if (!winner) return null;
    if (winner === 'draw') {
      if (winReason === 'timeout') {
        return { title: '무승부', body: '양쪽 모두 응답이 없어 게임이 종료되었습니다. (통계 미반영)' };
      }
      return { title: '무승부', body: '보드가 가득 찼습니다.' };
    }
    const iWon = winner === myColorStr;
    if (winReason === 'resign') {
      return iWon
        ? { title: '승리', body: '상대가 항복했습니다.' }
        : { title: '패배', body: '항복하셨습니다.' };
    }
    if (winReason === 'five') {
      return iWon
        ? { title: '승리', body: '5목 완성!' }
        : { title: '패배', body: '상대가 5목을 완성했습니다.' };
    }
    if (winReason === 'timeout') {
      return iWon
        ? { title: '승리', body: '상대가 3분간 응답이 없어 게임이 종료되었습니다. (통계 미반영)' }
        : { title: '패배', body: '본인이 응답하지 않아 게임이 종료되었습니다. (통계 미반영)' };
    }
    return iWon ? { title: '승리', body: '상대가 떠났습니다.' } : { title: '패배', body: '게임 종료.' };
  }, [winner, winReason, myColorStr]);

  const turnLabel = useMemo(() => {
    if (winner) return null;
    if (isMyTurn) return `내 차례 (${myColorStr === 'black' ? '흑' : '백'})`;
    return `${opponentLabelName} 차례 (${oppColorStr === 'black' ? '흑' : '백'})`;
  }, [winner, isMyTurn, myColorStr, oppColorStr, opponentLabelName]);

  return (
    <div className="app-shell">
      <div style={{
        padding: '8px 14px',
        background: 'var(--panel)',
        border: '1px solid var(--border)',
        borderRadius: 4,
        marginBottom: 12,
        fontSize: 13,
        color: 'var(--fg)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        maxWidth: 560, width: '100%',
        flexWrap: 'wrap',
      }}>
        <span>🌐 <b>{opponentLabelName}</b>와 대국 중</span>
        <span style={{
          marginLeft: 'auto',
          fontFamily: 'JetBrains Mono, monospace',
          color: 'var(--fg-muted)',
          fontSize: 11,
        }}>
          {roomCode}
        </span>
      </div>

      {/* 끊김 띠 */}
      {opponentDisconnected && !winner && (
        <div style={{
          padding: '10px 14px',
          background: 'rgba(231, 76, 60, 0.15)',
          border: '1px solid #e74c3c',
          borderRadius: 4,
          marginBottom: 12,
          fontSize: 13,
          color: 'var(--fg)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          maxWidth: 560, width: '100%',
          flexWrap: 'wrap',
        }}>
          <span>⚠ {opponentLabelName}이 응답이 없습니다</span>
          {!canTerminate ? (
            <span style={{
              marginLeft: 'auto',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 12,
              color: 'var(--fg-muted)',
            }}>
              {formatMMSS(opponentTimeoutSecondsLeft)} 후 게임 종료 가능
            </span>
          ) : (
            <button
              onClick={handleForceTerminate}
              style={{
                marginLeft: 'auto',
                background: '#e74c3c',
                color: '#fff',
                border: 'none',
                padding: '6px 14px',
                borderRadius: 3,
                fontSize: 12,
                fontFamily: 'JetBrains Mono, monospace',
                letterSpacing: '0.06em',
                cursor: 'pointer',
              }}
            >
              게임 종료하기
            </button>
          )}
        </div>
      )}

      <div className="game-shell">
        {!winner && (
          <div className="turn-indicator">
            <div className={`turn-stone ${turnStr === 'black' ? 'black' : 'white'}`} />
            <span>{turnLabel}</span>
          </div>
        )}
        {winner && (
          <div className="turn-indicator">
            <div className={`turn-stone ${winner === 'black' ? 'black' : (winner === 'white' ? 'white' : '')}`} />
            <span>
              {winner === 'draw' ? '무승부' : (winner === myColorStr ? '내가 이김' : `${opponentLabelName}이 이김`)}
            </span>
            <span className="winner-tag">winner</span>
          </div>
        )}
        {moveTimeLimit > 0 && !winner && turnSecondsLeft !== null && (
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 14,
            padding: '8px 14px',
            background: 'var(--panel)',
            border: '1px solid var(--border)',
            borderRadius: 4,
            fontSize: 13,
            fontFamily: 'JetBrains Mono, monospace',
            margin: '8px auto 0',
            maxWidth: 420,
          }}>
            <span style={{
              color: isMyTurn ? 'var(--fg)' : 'var(--fg-muted)',
              fontWeight: isMyTurn ? 600 : 400,
              ...(isMyTurn && turnSecondsLeft <= 5 ? { color: '#e74c3c' } : {}),
            }}>
              내 시간: {isMyTurn ? `${turnSecondsLeft}s` : `${moveTimeLimit}s`}
            </span>
            <span style={{ color: 'var(--fg-muted)' }}>·</span>
            <span style={{
              color: !isMyTurn ? 'var(--fg)' : 'var(--fg-muted)',
              fontWeight: !isMyTurn ? 600 : 400,
            }}>
              상대 시간: {!isMyTurn ? `${turnSecondsLeft}s` : `${moveTimeLimit}s`}
            </span>
          </div>
        )}

        <div className="board-wrap">
          <Board
            board={board}
            size={boardSize}
            lastMove={lastMove}
            winningLine={winningLine && winningLine.length > 0
              ? winningLine.map(p => ({ x: p.x, y: p.y, color: lastMove?.color }))
              : null}
            onCellClick={handleCellClick}
            disabled={!!winner || !isMyTurn}
          />
        </div>

        <div className="controls">
          <button className="secondary-btn" onClick={requestUndo}
            disabled={!!winner || !!undoRequest || moves.length === 0
              || ![...moves].some(m => m.color === myColorStr)}>
            ↶ 무르기 요청
          </button>
          <button className="secondary-btn" onClick={handleResign} disabled={!!winner}>⚑ 항복</button>
          <span className="meta">
            수 {moves.length}{lastMove && ` · ${coordLabel(lastMove.x, lastMove.y, boardSize)}`}
          </span>
          <button className="secondary-btn" onClick={handleExit}>✕ 나가기</button>
        </div>
      </div>

      <div className="online-chat-wrap">
        <ChatPanel
          roomCode={roomCode}
          user={user}
          opponentLabelName={opponentLabelName}
          chatEnabled={!!config.chatEnabled}
          emojiEnabled={!!config.emojiEnabled}
          expanded={chatExpanded}
          onToggleExpand={() => setChatExpanded(v => !v)}
        />
      </div>

      {/* 무르기 모달들 */}
      {undoRequest && undoRequest.byUid === user.uid && (
        <div className="modal-backdrop">
          <div className="modal">
            <h3>무르기 요청 중…</h3>
            <p>{opponentLabelName}의 응답을 기다리고 있습니다.</p>
            <p style={{ fontSize: 12, color: 'var(--fg-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
              {undoCountdown !== null ? `${undoCountdown}초 뒤에 자동 거절됩니다` : '...'}
            </p>
            <div className="modal-actions">
              <button className="secondary-btn" onClick={cancelMyUndo}>요청 취소</button>
            </div>
          </div>
        </div>
      )}
      {undoRequest && undoRequest.byUid !== user.uid && (
        <div className="modal-backdrop">
          <div className="modal">
            <h3>{opponentLabelName}이 무르기를 요청했습니다</h3>
            <p>마지막 수 한 개를 무르려고 합니다. 동의하시겠어요?</p>
            <p style={{ fontSize: 12, color: 'var(--fg-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
              {undoCountdown !== null ? `${undoCountdown}초 뒤에 이 메시지는 사라집니다` : '...'}
            </p>
            <div className="modal-actions">
              <button className="secondary-btn" onClick={declineUndo}>거절</button>
              <button className="primary-btn" onClick={acceptUndo}>수락</button>
            </div>
          </div>
        </div>
      )}

      {showDeclineAlert && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--panel)', border: '1px solid var(--border)',
          padding: '10px 18px', borderRadius: 4, fontSize: 13, color: 'var(--fg)',
          zIndex: 100, fontFamily: 'JetBrains Mono, monospace',
        }}>
          무르기 요청이 거절되었습니다.
        </div>
      )}

      {winner && resultMessage && !roomData.replayRequest && !replayRequested && (
        <div className="modal-backdrop">
          <div className="modal">
            <h3>{resultMessage.title}</h3>
            <p>{resultMessage.body}</p>
            <p style={{ fontSize: 12, color: 'var(--fg-muted)', fontFamily: 'JetBrains Mono, monospace' }}>총 {moves.length}수</p>
            <div className="modal-actions">
              <button className="secondary-btn" onClick={onExit}>나가기</button>
              <button className="primary-btn" onClick={requestReplayHandler}>다시 두기 요청</button>
            </div>
          </div>
        </div>
      )}

      {replayRequested && roomData.replayRequest && roomData.replayRequest.byUid === user.uid && (
        <div className="modal-backdrop">
          <div className="modal">
            <h3>다시 두기 요청 중…</h3>
            <p>{opponentLabelName}의 응답을 기다리고 있습니다.</p>
            <div className="modal-actions">
              <button className="secondary-btn" onClick={onExit}>나가기</button>
            </div>
          </div>
        </div>
      )}

      {roomData.replayRequest && roomData.replayRequest.byUid !== user.uid && winner && (
        <div className="modal-backdrop">
          <div className="modal">
            <h3>{opponentLabelName}이 다시 두기를 요청했습니다</h3>
            <p>같은 설정으로 한 번 더 두시겠어요?</p>
            <div className="modal-actions">
              <button className="secondary-btn" onClick={declineReplayHandler}>거절</button>
              <button className="primary-btn" onClick={acceptReplayHandler}>수락</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
