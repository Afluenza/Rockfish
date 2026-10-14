// popup.js: popup logic. Reads the board from the active tab, validates a FEN (pasted or read from
// the page), runs the Stockfish engine in a Worker, shows the top 3 moves and draws them on a mini board.
// The White/Black toggle chooses the side you play: it sets the board orientation and the side to move.
import { UciEngine, createWorkerTransport, ENGINE_JS, MULTI_PV } from '../engine/uci-engine.js';
import { renderBoard, ARROW_COLORS } from './board.js';
import { lineWinChance } from './candidate.js';

const MESSAGE_TYPE = 'chess-helper:read-board';
// Quick answer first, then the deeper pass replaces it. A lower depth shows a usable move while the full search runs.
export const ANALYSIS_DEPTHS = [4, 8, 12];
const SIDE_KEY = 'chess-helper:side';
const LIVE_MS = 1500;        // how often the page board is checked for a new move

let engine = null;
let busy = false;
let polling = false;
let liveFromPage = false;    // true only while the analysed position came from the page (not a pasted FEN)
let lastPage = null;         // { placement } last seen on the page, to spot a played move
let side = loadSide();       // 'w' or 'b': the side you play
let position = null;         // { placement, fen, assumed, moves } for the last analysed position

// Validates a FEN string. Page content is untrusted, so this runs on every FEN before the engine sees it.
// Returns { error: null, fen } when valid, or { error: 'reason' } when not.
export function validateFen(input) {
  const fen = String(input ?? '').trim().split(/\s+/).join(' ');
  const fields = fen.split(' ');
  if (fields.length !== 6) return { error: 'A FEN needs 6 space-separated fields.' };
  const [placement, side, castling, enPassant, halfmove, fullmove] = fields;

  const ranks = placement.split('/');
  if (ranks.length !== 8) return { error: 'Piece placement needs 8 ranks separated by "/".' };
  for (const rank of ranks) {
    let squares = 0;
    for (const ch of rank) {
      if (/[1-8]/.test(ch)) squares += Number(ch);
      else if (/[pnbrqkPNBRQK]/.test(ch)) squares += 1;
      else return { error: `Unknown character "${ch}" in piece placement.` };
    }
    if (squares !== 8) return { error: `A rank does not add up to 8 squares: "${rank}".` };
  }
  const count = (ch) => [...placement].filter((c) => c === ch).length;
  if (count('K') !== 1 || count('k') !== 1) return { error: 'The position needs exactly one white king (K) and one black king (k).' };

  if (side !== 'w' && side !== 'b') return { error: 'Side to move must be "w" or "b".' };
  if (!/^(-|[KQkq]{1,4})$/.test(castling)) return { error: 'Castling field must be "-" or letters from KQkq.' };
  if (!/^(-|[a-h][36])$/.test(enPassant)) return { error: 'En passant field must be "-" or a square such as e3 or d6.' };
  if (!/^\d+$/.test(halfmove) || !/^\d+$/.test(fullmove)) return { error: 'Move counters must be whole numbers.' };

  return { error: null, fen };
}

// Decides whether a board read from the page is a new position worth analysing.
// Returns { page, fen, assumed } when the placement differs from the last one seen, otherwise null.
// Failed or malformed reads return null, so a bad read never replaces the analysis.
export function liveUpdate(last, reply) {
  if (!reply || !reply.ok) return null;
  const checked = validateFen(reply.fen);
  if (checked.error) return null;
  const placement = checked.fen.split(' ')[0];
  if (last && last.placement === placement) return null;
  return { page: { placement }, fen: checked.fen, assumed: reply.assumed || [] };
}

// Replaces the side-to-move field of a FEN with the side chosen by the toggle.
export function fenWithSide(fen, sideToMove) {
  const fields = fen.split(' ');
  fields[1] = sideToMove;
  return fields.join(' ');
}

// Converts a White-point-of-view score into text for the list.
export function formatWhiteScore(move) {
  if (move.whiteMate !== null && move.whiteMate !== undefined) {
    return move.whiteMate >= 0 ? `M${move.whiteMate}` : `-M${Math.abs(move.whiteMate)}`;
  }
  const pawns = move.whiteCp / 100;
  return (pawns >= 0 ? '+' : '') + pawns.toFixed(2);
}

function loadSide() {
  try {
    return localStorage.getItem(SIDE_KEY) === 'b' ? 'b' : 'w';
  } catch {
    return 'w';
  }
}

function saveSide(value) {
  try {
    localStorage.setItem(SIDE_KEY, value);
  } catch {
    // Storage can be unavailable; the toggle still works for this open popup.
  }
}

function getEngine() {
  if (!engine) {
    const url = chrome.runtime.getURL(`engine/${ENGINE_JS}`);
    engine = new UciEngine(createWorkerTransport(url), { multiPv: MULTI_PV });
  }
  return engine;
}

function $(id) {
  return document.getElementById(id);
}

function setStatus(text, isError = false) {
  const el = $('status');
  el.textContent = text;
  el.className = isError ? 'error' : '';
}

function setBusy(value) {
  busy = value;
  $('read').disabled = value;
  $('analyse-fen').disabled = value;
  $('side-toggle').disabled = value;
}

function sideLabel(value) {
  return value === 'b' ? 'Black' : 'White';
}

// Keeps the toggle label, the board orientation and the side-to-move note in step with the chosen side.
function applySide() {
  $('side-toggle').checked = side === 'b';
  $('side-label').textContent = sideLabel(side);
  if (position) renderPosition();
}

function renderPosition() {
  const threat = position.threat ? position.threat.moves[0] : null;
  renderBoard(document, $('board'), position.placement, position.moves, side === 'b', threat);
  renderEvalBar();
}

// Win chance for White, from the best line (White point of view). Null when no line is scored yet.
function whiteWinChance() {
  const best = position?.moves?.[0];
  if (!best) return null;
  const sideWin = lineWinChance(best);
  return side === 'w' ? sideWin : 1 - sideWin;
}

// Bar beside the board: the White share of the win chance, so the side that is ahead is easy to see.
function renderEvalBar() {
  const bar = $('eval-bar');
  const share = whiteWinChance();
  if (share === null) {
    bar.style.height = '50%';
    bar.dataset.empty = '1';
    return;
  }
  bar.dataset.empty = '0';
  bar.style.height = `${Math.round(share * 100)}%`;
}

// Depth and seconds reached for the last analysis, shown in the status line.
function timeScope(depth, seconds) {
  return `depth ${depth}, ${seconds.toFixed(1)} s`;
}

const ARROW_NAMES = ['best', 'second', 'third'];

function showMoves(moves) {
  const list = $('moves');
  list.textContent = '';
  if (!moves.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'No moves yet.';
    list.append(empty);
    return;
  }
  moves.slice(0, ARROW_NAMES.length).forEach((move, i) => {
    const colour = ARROW_COLORS[i];
    const li = document.createElement('li');
    li.className = 'line';
    li.style.setProperty('--c', colour);
    const rank = document.createElement('span');
    rank.className = 'rank';
    rank.textContent = String(i + 1);
    rank.title = ARROW_NAMES[i];
    const head = document.createElement('span');
    head.className = 'move';
    head.textContent = move.uci;
    const ev = document.createElement('span');
    const isWhite = !String(formatWhiteScore(move)).startsWith('-');
    ev.className = `eval ${isWhite ? 'white' : 'black'}`;
    ev.textContent = formatWhiteScore(move);
    const pv = document.createElement('div');
    pv.className = 'pv';
    pv.textContent = move.pv.slice(0, 6).join(' ');
    li.append(rank, head, ev, pv);
    list.append(li);
  });
}

const SITE_URLS = ['https://www.chess.com/*', 'https://lichess.org/*'];

// Finds the chess tab. The helper can live in its own window, so "active tab of this window" would
// be the helper itself; instead look for chess.com / lichess tabs anywhere, preferring the visible one.
async function findChessTab() {
  const tabs = await chrome.tabs.query({ url: SITE_URLS });
  if (!tabs.length) return null;
  tabs.sort((a, b) => (Number(b.active) - Number(a.active)) || ((b.lastAccessed || 0) - (a.lastAccessed || 0)));
  return tabs[0];
}

async function readBoardFromTab() {
  const tab = await findChessTab();
  if (!tab) return { ok: false, error: 'No chess.com or lichess.org tab is open. Open a board, or paste a FEN.' };
  try {
    return await chrome.tabs.sendMessage(tab.id, { type: MESSAGE_TYPE });
  } catch {
    // Tab was open before the extension loaded: inject the reader and ask again.
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['src/selectors.js', 'src/content.js'] });
      return await chrome.tabs.sendMessage(tab.id, { type: MESSAGE_TYPE });
    } catch {
      return { ok: false, error: 'The page did not answer. Reload the chess.com or lichess.org tab, or paste a FEN.' };
    }
  }
}

// The opponent's biggest threat: the engine's best move if the other side were to play now.
// It is searched at THREAT_DEPTH so it does not slow the first answer.
export const THREAT_DEPTH = 8;

// The position with the other side to move, so the engine can find the opponent's best move.
export function threatFen(fen) {
  return fenWithSide(fen, fen.split(' ')[1] === 'w' ? 'b' : 'w');
}

async function analyse(fen, assumed) {
  const target = fenWithSide(fen, side);
  const placement = target.split(' ')[0];
  position = { placement, fen: target, assumed, moves: [], threat: null };
  showFen(target, assumed);
  renderPosition();
  setBusy(true);
  setStatus('Analysing. The first run loads the engine and can take a few seconds.');
  const started = performance.now();
  try {
    const engineRef = getEngine();
    for (const depth of ANALYSIS_DEPTHS) {
      const result = await engineRef.analyse(target, depth);
      position.moves = result.moves;
      showMoves(result.moves);
      renderPosition();
      const isLast = depth === ANALYSIS_DEPTHS[ANALYSIS_DEPTHS.length - 1];
      const seconds = (performance.now() - started) / 1000;
      setStatus(isLast
        ? `Best move ${result.bestmove}, ${timeScope(result.depth, seconds)}.`
        : `Quick answer, ${timeScope(result.depth, seconds)}. Checking deeper...`);
    }
    // The threat is the opponent's best move in the mirrored position. It is drawn in red, not ranked with the top three.
    const threatResult = await engineRef.analyse(threatFen(target), THREAT_DEPTH);
    position.threat = { moves: threatResult.moves };
    renderPosition();
  } catch (e) {
    // Drop the engine so the next click starts a fresh worker (the engine can be left in a bad state).
    if (engine) engine.close();
    engine = null;
    // Keep a quick answer that already arrived; clear the list only when nothing from this position did.
    if (!position.moves.length) $('moves').textContent = '';
    setStatus(`Engine error: ${e.message}`, true);
  } finally {
    setBusy(false);
  }
}

function showFen(fen, assumed = []) {
  $('fen-out').value = fen;
  const notes = [`Playing ${sideLabel(side)} (side to move set by the toggle)`, ...assumed.filter((a) => !/side to move/.test(a))];
  $('assumed').textContent = notes.length ? `Assumed: ${notes.join(', ')}.` : '';
}

async function onReadBoard() {
  if (busy) return;
  setBusy(true);
  setStatus('Reading board from the tab...');
  const reply = await readBoardFromTab();
  setBusy(false);
  if (!reply || !reply.ok) {
    setStatus(reply?.error || 'Could not read the board.', true);
    return;
  }
  const checked = validateFen(reply.fen);
  if (checked.error) {
    setStatus(`The page gave a malformed FEN: ${checked.error} Paste a FEN instead.`, true);
    return;
  }
  liveFromPage = true;
  lastPage = { placement: checked.fen.split(' ')[0] };
  startPolling();
  await analyse(checked.fen, reply.assumed);
}

async function onAnalysePasted() {
  if (busy) return;
  const checked = validateFen($('fen-paste').value);
  if (checked.error) {
    setStatus(`Malformed FEN: ${checked.error}`, true);
    return;
  }
  liveFromPage = false; // a pasted FEN is never overwritten by the page
  await analyse(checked.fen, []);
}

// Checks the page every LIVE_MS. When a move has been played (the board changed),
// it re-analyses for the chosen side. Runs only after a successful Scan, and never over a pasted FEN.
function startPolling() {
  if (polling) return;
  polling = true;
  const tick = async () => {
    if (!polling) return;
    if (liveFromPage && !busy) {
      const reply = await readBoardFromTab();
      const next = liveUpdate(lastPage, reply);
      if (next) {
        lastPage = next.page;
        await analyse(next.fen, next.assumed);
      }
    }
    if (polling) setTimeout(tick, LIVE_MS);
  };
  setTimeout(tick, LIVE_MS);
}

// Switching sides re-runs the analysis for the position on screen, so the moves match the side you play.
async function onToggleSide(event) {
  if (busy) return;
  side = event.target.checked ? 'b' : 'w';
  saveSide(side);
  applySide();
  if (position) await analyse(position.fen, position.assumed);
}

function init() {
  const inOverlay = new URLSearchParams(location.search).get('overlay') === '1';
  const float = $('float');
  if (inOverlay) {
    float.remove();
  } else {
    float.addEventListener('click', async () => {
      const r = await chrome.runtime.sendMessage({ type: 'chess-helper:float' });
      if (!r || !r.ok) setStatus('Open a chess.com or lichess.org tab first, then press Float on page.', true);
    });
  }
  $('read').addEventListener('click', onReadBoard);
  $('analyse-fen').addEventListener('click', onAnalysePasted);
  $('side-toggle').addEventListener('change', onToggleSide);
  $('fen-paste').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') onAnalysePasted();
  });
  applySide();
}

if (typeof document !== 'undefined' && typeof chrome !== 'undefined') init();
