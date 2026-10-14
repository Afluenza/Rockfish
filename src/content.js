// content.js: reads the board position from the DOM of a chess.com or lichess.org page and
// answers the popup with a FEN. Clean-room, written from the spec. Selectors come from selectors.js.
//
// Read by the content script: piece placement (required).
// Inferred from the placement: castling rights (a right is offered only when its king and rook
//   stand on their home squares). A king that moved away and back is still offered the right.
// Assumed, not read: side to move ('w') and en passant ('-'). The popup shows these as assumed.
(function () {
  'use strict';

  const S = self.CHESS_HELPER_SELECTORS;
  const MESSAGE_TYPE = 'chess-helper:read-board';

  // Square = { file: 0-7 (a-h), rank: 0-7 (0 = rank 1) , piece: letter in FEN case }.
  function fenFromSquares(squares, sideToMove, castling, enPassant) {
    const grid = Array.from({ length: 8 }, () => Array(8).fill(null));
    for (const sq of squares) grid[7 - sq.rank][sq.file] = sq.piece;
    const rows = grid.map((row) => {
      let out = '';
      let empty = 0;
      for (const cell of row) {
        if (cell) {
          if (empty) out += empty;
          empty = 0;
          out += cell;
        } else {
          empty++;
        }
      }
      if (empty) out += empty;
      return out;
    });
    return `${rows.join('/')} ${sideToMove} ${castling} ${enPassant} 0 1`;
  }

  // Castling rights offered by the placement: king on its home square and a rook on the corner.
  function castlingFromSquares(squares) {
    const at = new Map(squares.map((s) => [`${s.file},${s.rank}`, s.piece]));
    let rights = '';
    if (at.get('4,0') === 'K' && at.get('7,0') === 'R') rights += 'K';
    if (at.get('4,0') === 'K' && at.get('0,0') === 'R') rights += 'Q';
    if (at.get('4,7') === 'k' && at.get('7,7') === 'r') rights += 'k';
    if (at.get('4,7') === 'k' && at.get('0,7') === 'r') rights += 'q';
    return rights || '-';
  }

  function hasBothKings(squares) {
    return squares.some((s) => s.piece === 'K') && squares.some((s) => s.piece === 'k');
  }

  // chess.com: each piece is a .piece element with a colour+role token ("wp") and a square token ("square-54").
  function readChessCom(doc) {
    const cc = S.chessCom;
    const squares = [];
    for (const el of doc.querySelectorAll(cc.piece)) {
      if (isIgnored(el)) continue;
      let piece = null;
      let sq = null;
      for (const token of el.classList) {
        const pm = cc.pieceClass.exec(token);
        if (pm) piece = pm[1] === 'w' ? pm[2].toUpperCase() : pm[2];
        const sm = cc.squareClass.exec(token);
        if (sm) sq = { file: Number(sm[1]) - 1, rank: Number(sm[2]) - 1 };
      }
      if (piece && sq) squares.push({ ...sq, piece });
    }
    return squares;
  }

  // lichess: chessground renders each piece as a <piece class="white king"> with a px translate.
  function readLichess(doc) {
    const lc = S.lichess;
    const board = doc.querySelector(lc.board);
    if (!board) return null;
    // clientWidth is the unscaled layout width, which matches the px values in piece translates.
    const size = board.clientWidth / 8;
    if (!size) return null;
    const flipped = !!board.closest(lc.blackOrientation) || board.classList.contains('orientation-black');
    const squares = [];
    for (const el of board.querySelectorAll(lc.piece)) {
      if (isIgnored(el)) continue;
      const m = lc.pieceTranslate.exec(el.style.transform || '');
      if (!m) continue;
      let color = null;
      let role = null;
      for (const token of el.classList) {
        if (lc.colors[token]) color = lc.colors[token];
        if (lc.roles[token]) role = lc.roles[token];
      }
      if (!color || !role) continue;
      const x = Math.round(Number(m[1]) / size);
      const y = Math.round(Number(m[2]) / size);
      if (x < 0 || x > 7 || y < 0 || y > 7) continue;
      const file = flipped ? 7 - x : x;
      const rankFromTop = flipped ? 7 - y : y;
      const letter = role;
      squares.push({ file, rank: 7 - rankFromTop, piece: color === 'w' ? letter.toUpperCase() : letter });
    }
    return squares;
  }

  function isIgnored(el) {
    return S.ignoredPieceClasses.some((c) => el.classList.contains(c));
  }

  function readBoard(doc, host) {
    const site = host === 'lichess.org' ? 'lichess' : host === 'www.chess.com' || host === 'chess.com' ? 'chess.com' : null;
    if (!site) return { ok: false, error: 'This page is not chess.com or lichess.org.' };
    const squares = site === 'lichess' ? readLichess(doc) : readChessCom(doc);
    if (!squares) return { ok: false, error: 'No board found on this page. Open a game or analysis board, or paste a FEN in the popup.' };
    if (squares.length === 0) return { ok: false, error: 'Board found but no pieces were read. Paste a FEN in the popup.' };
    if (!hasBothKings(squares)) return { ok: false, error: 'Pieces were read but a king is missing. Paste a FEN in the popup.' };
    const castling = castlingFromSquares(squares);
    const fen = fenFromSquares(squares, 'w', castling, '-');
    return {
      ok: true,
      fen,
      site,
      assumed: ['side to move (White assumed)', 'en passant (none assumed)'],
    };
  }

  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (!msg || msg.type !== MESSAGE_TYPE) return false;
      try {
        sendResponse(readBoard(document, location.hostname));
      } catch (e) {
        sendResponse({ ok: false, error: `Could not read the board: ${e.message}` });
      }
      return false;
    });
  }

  // Exposed so the logic can be tested under Node without a browser.
  self.CHESS_HELPER_CONTENT = { readBoard, fenFromSquares, castlingFromSquares };
})();
