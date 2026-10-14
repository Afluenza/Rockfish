// board.js: draws the mini board and the arrows for the top moves. The helpers are pure so
// tests/board-and-popup.test.mjs can run them under Node. renderBoard only touches the document it is given.

export const ARROW_COLORS = ['#30d158', '#ffd60a', '#ff9f0a']; // best green, second yellow, third orange
// The opponent's biggest threat: a fourth arrow, always red.
export const THREAT_COLOR = '#ff453a';
const SVG_NS = 'http://www.w3.org/2000/svg';
const CELL = 40;
const BOARD = CELL * 8;
const LIGHT = '#f0d9b5';
const DARK = '#b58863';
const GLYPHS = {
  K: '\u2654', Q: '\u2655', R: '\u2656', B: '\u2657', N: '\u2658', P: '\u2659',
  k: '\u265A', q: '\u265B', r: '\u265C', b: '\u265D', n: '\u265E', p: '\u265F',
};
const UCI_SQUARES = /^[a-h][1-8][a-h][1-8]/;

// Expands the placement field into pieces: file 0-7 (a-h), rank 0-7 (0 = rank 1), piece letter.
export function placementToPieces(placement) {
  const pieces = [];
  placement.split('/').forEach((row, i) => {
    const rank = 7 - i;
    let file = 0;
    for (const ch of row) {
      if (/[1-8]/.test(ch)) {
        file += Number(ch);
      } else {
        pieces.push({ file, rank, piece: ch });
        file++;
      }
    }
  });
  return pieces;
}

// Centre of a square on the board. flipped puts Black at the bottom.
export function pointFor(file, rank, flipped) {
  const col = flipped ? 7 - file : file;
  const row = flipped ? rank : 7 - rank;
  return { x: col * CELL + CELL / 2, y: row * CELL + CELL / 2 };
}

// One arrow for a UCI move, from its start square to its end square.
function arrowFor(uci, color, rank, flipped) {
  return {
    from: pointFor(uci.charCodeAt(0) - 97, Number(uci[1]) - 1, flipped),
    to: pointFor(uci.charCodeAt(2) - 97, Number(uci[3]) - 1, flipped),
    color,
    rank,
  };
}

// One arrow per move, best first. Moves whose UCI squares are malformed are skipped.
// threat (the move the opponent would play now) adds one red arrow after the top moves.
export function arrowsFor(moves, flipped, threat = null) {
  const arrows = moves
    .filter((m) => typeof m.uci === 'string' && UCI_SQUARES.test(m.uci))
    .slice(0, ARROW_COLORS.length)
    .map((m, i) => arrowFor(m.uci, ARROW_COLORS[i], i + 1, flipped));
  if (threat && typeof threat.uci === 'string' && UCI_SQUARES.test(threat.uci)) {
    arrows.push(arrowFor(threat.uci, THREAT_COLOR, 'threat', flipped));
  }
  return arrows;
}

// Draws the board into container as an SVG: squares, pieces, then arrows on top.
export function renderBoard(doc, container, placement, moves, flipped, threat = null) {
  const el = (tag, attrs = {}) => {
    const node = doc.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
    return node;
  };
  const svg = el('svg', {
    viewBox: `0 0 ${BOARD} ${BOARD}`,
    role: 'img',
    'aria-label': 'Board with arrows to the top moves',
  });
  const defs = el('defs');
  svg.appendChild(defs);

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      svg.appendChild(el('rect', {
        x: col * CELL, y: row * CELL, width: CELL, height: CELL,
        fill: (row + col) % 2 === 0 ? LIGHT : DARK,
      }));
    }
  }

  for (const p of placementToPieces(placement)) {
    const { x, y } = pointFor(p.file, p.rank, flipped);
    const white = p.piece === p.piece.toUpperCase();
    const text = el('text', {
      x, y,
      'text-anchor': 'middle',
      'dominant-baseline': 'central',
      'font-size': 34,
      fill: white ? '#ffffff' : '#111111',
      stroke: white ? '#111111' : 'none',
      'stroke-width': white ? 1.2 : 0,
    });
    text.textContent = GLYPHS[p.piece];
    svg.appendChild(text);
  }

  arrowsFor(moves, flipped, threat).forEach((arrow, i) => {
    const id = `arrowhead-${i}`;
    const marker = el('marker', { id, markerWidth: 3, markerHeight: 3, refX: 3, refY: 1.5, orient: 'auto' });
    marker.appendChild(el('path', { d: 'M0,0 L3,1.5 L0,3 Z', fill: arrow.color }));
    defs.appendChild(marker);
    svg.appendChild(el('line', {
      x1: arrow.from.x, y1: arrow.from.y, x2: arrow.to.x, y2: arrow.to.y,
      stroke: arrow.color,
      'stroke-width': 6,
      'stroke-linecap': 'round',
      opacity: 0.85,
      'marker-end': `url(#${id})`,
    }));
  });

  container.textContent = '';
  container.appendChild(svg);
  return svg;
}
