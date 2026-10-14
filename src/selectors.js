// selectors.js: every DOM selector the content script uses, in one place.
// Loaded as a classic content script before content.js. Exposes self.CHESS_HELPER_SELECTORS.
// Change a site's markup by editing only this file.
//
// Verification status:
//   lichess: 'cg-board' and 'piece' seen on a live lichess.org editor page (headless, this run).
//            Piece position read from style.transform translate(px, px): UNVERIFIED on a live game.
//   chess.com: UNVERIFIED. No readable board was available in this run.
(function () {
  'use strict';

  const SELECTORS = Object.freeze({
    chessCom: Object.freeze({
      board: 'wc-chess-board, chess-board, .board',
      piece: '.piece',
      // Piece token like "wp" (white pawn) or "bk" (black king).
      pieceClass: /^([wb])([pnbrqk])$/,
      // Square token like "square-54" = file 5 (e), rank 4. Absolute, so no board flip needed.
      squareClass: /^square-([1-8])([1-8])$/,
    }),
    lichess: Object.freeze({
      board: 'cg-board',
      piece: 'piece',
      // Set on the board or an ancestor when Black is at the bottom.
      blackOrientation: '.orientation-black',
      // Translate in px inside a piece's inline style, e.g. "translate(303px, 1212px)".
      pieceTranslate: /translate\(\s*(-?[\d.]+)px\s*,\s*(-?[\d.]+)px\s*\)/,
      colors: Object.freeze({ white: 'w', black: 'b' }),
      roles: Object.freeze({ pawn: 'p', knight: 'n', bishop: 'b', rook: 'r', queen: 'q', king: 'k' }),
    }),
    // Piece elements with these class tokens are ignored (mid-drag ghosts and drag copies).
    ignoredPieceClasses: Object.freeze(['ghost', 'dragging']),
  });

  self.CHESS_HELPER_SELECTORS = SELECTORS;
})();
