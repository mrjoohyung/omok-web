import { chooseAIMove } from './ai.js';

export function getHint(board, color, options = {}) {
  const { renju = false, allowOverline = true } = options;
  return chooseAIMove(board, color, {
    level: 5,
    style: 'balanced',
    renju,
    allowOverline,
    timeLimit: 3000,
  });
}
