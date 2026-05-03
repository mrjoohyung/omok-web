export const EMPTY = 0;
export const BLACK = 1;
export const WHITE = 2;

export const DIRECTIONS = [
  { dx: 1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: 1, dy: 1 },
  { dx: 1, dy: -1 },
];

export function createBoard(size) {
  return Array.from({ length: size }, () => Array(size).fill(EMPTY));
}

export function cloneBoard(board) {
  return board.map(row => row.slice());
}

export function inBounds(board, x, y) {
  return x >= 0 && y >= 0 && x < board.length && y < board.length;
}

export function checkWin(board, x, y, color, options = {}) {
  const { allowOverline = true } = options;
  for (const { dx, dy } of DIRECTIONS) {
    let length = 1;
    let rx = x + dx, ry = y + dy;
    while (inBounds(board, rx, ry) && board[ry][rx] === color) {
      length++; rx += dx; ry += dy;
    }
    let lx = x - dx, ly = y - dy;
    while (inBounds(board, lx, ly) && board[ly][lx] === color) {
      length++; lx -= dx; ly -= dy;
    }
    if (allowOverline ? length >= 5 : length === 5) {
      return { winner: color, line: collectLine(x, y, dx, dy, color, board) };
    }
  }
  return { winner: null, line: null };
}

function collectLine(x, y, dx, dy, color, board) {
  const points = [{ x, y }];
  let cx = x + dx, cy = y + dy;
  while (inBounds(board, cx, cy) && board[cy][cx] === color) {
    points.push({ x: cx, y: cy }); cx += dx; cy += dy;
  }
  cx = x - dx; cy = y - dy;
  while (inBounds(board, cx, cy) && board[cy][cx] === color) {
    points.unshift({ x: cx, y: cy }); cx -= dx; cy -= dy;
  }
  return points;
}

export function isBoardFull(board) {
  for (let y = 0; y < board.length; y++) {
    for (let x = 0; x < board.length; x++) {
      if (board[y][x] === EMPTY) return false;
    }
  }
  return true;
}

export function analyzeLine(board, x, y, dx, dy, color) {
  const opp = color === BLACK ? WHITE : BLACK;
  const radius = 5;
  const cells = [];
  for (let i = -radius; i <= radius; i++) {
    const nx = x + dx * i;
    const ny = y + dy * i;
    if (i === 0) { cells.push('X'); continue; }
    if (!inBounds(board, nx, ny)) { cells.push('#'); continue; }
    const v = board[ny][nx];
    if (v === color) cells.push('X');
    else if (v === opp) cells.push('O');
    else cells.push('.');
  }
  const line = cells.join('');

  let l = radius - 1, r = radius + 1;
  while (l >= 0 && line[l] === 'X') l--;
  while (r < line.length && line[r] === 'X') r++;
  const consec = r - l - 1;

  const result = {
    consec, five: false, exactlyFive: false, overline: false,
    open4: false, four: false, open3: false, three: false,
  };

  if (consec >= 5) {
    result.five = true;
    if (consec === 5) result.exactlyFive = true;
    else result.overline = true;
    return result;
  }

  let fivePoints = 0;
  for (let i = 0; i < line.length; i++) {
    if (line[i] !== '.') continue;
    let li = i - 1, ri = i + 1;
    while (li >= 0 && line[li] === 'X') li--;
    while (ri < line.length && line[ri] === 'X') ri++;
    if (ri - li - 1 >= 5) fivePoints++;
  }
  if (fivePoints >= 2) { result.open4 = true; result.four = true; }
  else if (fivePoints === 1) result.four = true;

  if (!result.four) {
    let open4Points = 0, fourPoints = 0;
    for (let i = 0; i < line.length; i++) {
      if (line[i] !== '.') continue;
      const newCells = cells.slice();
      newCells[i] = 'X';
      const newLine = newCells.join('');
      const sub = analyzeLineString(newLine);
      if (sub.open4) open4Points++;
      else if (sub.four) fourPoints++;
    }
    if (open4Points >= 1) result.open3 = true;
    if (open4Points + fourPoints >= 1) result.three = true;
  }

  return result;
}

function analyzeLineString(line) {
  let fivePoints = 0;
  for (let i = 0; i < line.length; i++) {
    if (line[i] !== '.') continue;
    let li = i - 1, ri = i + 1;
    while (li >= 0 && line[li] === 'X') li--;
    while (ri < line.length && line[ri] === 'X') ri++;
    if (ri - li - 1 >= 5) fivePoints++;
  }
  return { open4: fivePoints >= 2, four: fivePoints >= 1 };
}

export function summarizeMove(board, x, y, color) {
  const summary = {
    five: false, exactlyFive: false, overline: false,
    fours: 0, openFours: 0, threes: 0, openThrees: 0,
  };
  for (const { dx, dy } of DIRECTIONS) {
    const a = analyzeLine(board, x, y, dx, dy, color);
    if (a.five) summary.five = true;
    if (a.exactlyFive) summary.exactlyFive = true;
    if (a.overline) summary.overline = true;
    if (a.open4) summary.openFours++;
    if (a.four) summary.fours++;
    if (a.open3) summary.openThrees++;
    if (a.three) summary.threes++;
  }
  return summary;
}

export function isForbidden(board, x, y, color) {
  if (color !== BLACK) return { forbidden: false };
  const next = cloneBoard(board);
  next[y][x] = BLACK;
  const sum = summarizeMove(next, x, y, BLACK);
  if (sum.exactlyFive && !sum.overline) return { forbidden: false };
  if (sum.overline) return { forbidden: true, reason: 'overline', label: '장목' };
  if (sum.fours >= 2) return { forbidden: true, reason: 'doubleFour', label: '4-4' };
  if (sum.openThrees >= 2) return { forbidden: true, reason: 'doubleThree', label: '3-3' };
  return { forbidden: false };
}

export function findThreatCells(board, opponentColor) {
  const fours = [];
  const openThrees = [];
  const doubleThreats = [];
  const size = board.length;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (board[y][x] !== EMPTY) continue;
      const next = cloneBoard(board);
      next[y][x] = opponentColor;
      const sum = summarizeMove(next, x, y, opponentColor);
      if (sum.five) { fours.push({ x, y, kind: 'five' }); continue; }
      if (sum.openFours >= 1 || sum.fours >= 1) {
        fours.push({ x, y, kind: sum.openFours >= 1 ? 'open4' : 'four' });
      }
      if (sum.openThrees >= 2 || sum.fours >= 2) {
        doubleThreats.push({ x, y, kind: sum.openThrees >= 2 ? 'three3' : 'four4' });
      } else if (sum.openThrees >= 1) {
        openThrees.push({ x, y });
      }
    }
  }
  return { fours, openThrees, doubleThreats };
}

const COL_LETTERS = 'ABCDEFGHJKLMNOPQRST';
export function coordLabel(x, y, size) {
  const col = COL_LETTERS[x] || '?';
  const row = size - y;
  return `${col}${row}`;
}
