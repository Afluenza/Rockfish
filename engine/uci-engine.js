// uci-engine.js: UCI wrapper for the Stockfish 18 Lite single-threaded WASM build.
// Written from the UCI protocol spec. Runs in a browser Worker (extension offscreen
// document) or in Node (test-pipeline.mjs). Stockfish itself is GPL-3.0; see LICENSE-stockfish.txt.
//
// shortcut: one search at a time; a second analyse() while busy is rejected. Upgrade to a queue if the UI needs overlapping requests.
// shortcut: a timed-out search sends 'stop' and ignores its late bestmove; if the engine never answers, create a new UciEngine.
// shortcut: Lite single-threaded build only (no cross-origin isolation needed). Upgrade to the full build if strength matters more than load time.

export const ENGINE_JS = 'stockfish-18-lite-single.js';
export const ENGINE_WASM = 'stockfish-18-lite-single.wasm';
export const MULTI_PV = 3;

// Trust boundary: FEN may come from page content. The regex rejects anything with a newline or extra tokens,
// so a crafted string cannot inject a second UCI command.
const FEN_RE = /^([pnbrqkPNBRQK1-8]{1,8}\/){7}[pnbrqkPNBRQK1-8]{1,8} [wb] (-|[KQkq]{1,4}) (-|[a-h][36]) \d+ \d+$/;

// Parse one UCI 'info' line. Returns null unless it carries a score and a pv.
export function parseInfo(line) {
  if (!line.startsWith('info ')) return null;
  const t = line.split(/\s+/);
  const out = { depth: 0, multipv: 1, pv: [] };
  for (let i = 1; i < t.length; i++) {
    if (t[i] === 'depth') out.depth = Number(t[++i]);
    else if (t[i] === 'multipv') out.multipv = Number(t[++i]);
    else if (t[i] === 'score') {
      const kind = t[++i];
      const value = Number(t[++i]);
      if (kind === 'cp') out.cp = value;
      else if (kind === 'mate') out.mate = value;
    } else if (t[i] === 'pv') {
      out.pv = t.slice(i + 1);
      break;
    }
  }
  if (out.pv.length === 0 || (out.cp === undefined && out.mate === undefined)) return null;
  return out;
}

// Browser transport used by the popup and overlay. The Stockfish Worker does not run in the page-embedded
// popup iframe (Chrome fails to load it there, "engine worker failed to load"). It runs in the offscreen
// document instead (src/offscreen.js), reached through background.js over a port. The url argument is unused.
export function createWorkerTransport() {
  const port = chrome.runtime.connect({ name: 'rockfish-engine' });
  let onLine = () => {};
  let onError = () => {};
  port.onMessage.addListener((msg) => {
    if (msg.line !== undefined) onLine(String(msg.line));
    else if (msg.error !== undefined) onError(String(msg.error));
  });
  port.onDisconnect.addListener(() => onError('engine connection lost'));
  return {
    send: (cmd) => port.postMessage({ cmd }),
    setListener: (fn) => { onLine = fn; },
    setErrorListener: (fn) => { onError = fn; },
    close: () => port.disconnect(),
  };
}

// Worker transport for the offscreen document only: wraps the Stockfish Worker at url.
// A worker that fails to load or throws fires onerror, not onmessage. Report it so the engine call fails fast.
export function createLocalWorkerTransport(url) {
  const worker = new Worker(url);
  let onLine = () => {};
  let onError = () => {};
  worker.onmessage = (e) => onLine(String(e.data));
  worker.onerror = (e) => onError(e.message || `engine worker failed to load from ${url}`);
  return {
    send: (cmd) => worker.postMessage(cmd),
    setListener: (fn) => { onLine = fn; },
    setErrorListener: (fn) => { onError = fn; },
    close: () => worker.terminate(),
  };
}

// Transport for Node. Loads the same Emscripten build the way the stockfish package does.
export async function createNodeTransport(dir) {
  const { createRequire } = await import('node:module');
  const path = await import('node:path');
  const req = createRequire(import.meta.url);
  const factory = req(path.join(dir, ENGINE_JS));
  let onLine = () => {};
  const engine = {
    locateFile: (p) => (p.includes('.wasm') ? path.join(dir, ENGINE_WASM) : path.join(dir, p)),
    listener: (line) => onLine(String(line)),
  };
  await factory()(engine);
  while (engine._isReady && !engine._isReady()) await new Promise((r) => setTimeout(r, 10));
  return {
    // setImmediate matches the stockfish package loader; 'go' must run async.
    send: (cmd) => setImmediate(() => engine.ccall('command', null, ['string'], [cmd], { async: /^go\b/.test(cmd) })),
    setListener: (fn) => { onLine = fn; },
    close: () => {},
  };
}

export class UciEngine {
  constructor(transport, { multiPv = MULTI_PV, timeoutMs = 120000 } = {}) {
    this.transport = transport;
    this.multiPv = multiPv;
    this.timeoutMs = timeoutMs;
    this.ready = false;
    this.starting = null;
    this.waiter = null;    // { prefix, done } for uciok / readyok
    this.search = null;    // { depth, sideToMove, lines, resolve, timer }
    this.stopping = false; // true after a timeout until its late bestmove arrives
    transport.setListener((line) => this._onLine(line.trim()));
    if (transport.setErrorListener) transport.setErrorListener((message) => this._onError(message));
  }

  // Handshake: uci -> uciok, MultiPV, isready -> readyok.
  start() {
    if (!this.starting) this.starting = this._start().catch((e) => { this.starting = null; throw e; });
    return this.starting;
  }

  async _start() {
    const uciok = this._expect('uciok');
    this.transport.send('uci');
    await uciok;
    this.transport.send(`setoption name MultiPV value ${this.multiPv}`);
    const readyok = this._expect('readyok');
    this.transport.send('isready');
    await readyok;
    this.ready = true;
  }

  // Analyse a FEN to a fixed depth. Resolves to { bestmove, depth, moves[] }, moves ranked 1..multiPv.
  async analyse(fen, depth = 12) {
    if (typeof fen !== 'string' || !FEN_RE.test(fen)) throw new TypeError('invalid FEN');
    if (!Number.isInteger(depth) || depth < 1 || depth > 64) throw new RangeError('depth must be an integer 1-64');
    await this.start();
    if (this.search || this.stopping) throw new Error('engine busy: one search at a time');
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.search = null;
        this.stopping = true;
        this.transport.send('stop');
        reject(new Error('search timed out'));
      }, this.timeoutMs);
      this.search = { depth, sideToMove: fen.split(' ')[1], lines: [], resolve, reject, timer };
      this.transport.send(`position fen ${fen}`);
      this.transport.send(`go depth ${depth}`);
    });
  }

  close() {
    this.transport.close();
  }

  _expect(prefix) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiter = null;
        reject(new Error(`timeout waiting for ${prefix}`));
      }, this.timeoutMs);
      this.waiter = {
        prefix,
        done: (line) => { clearTimeout(timer); this.waiter = null; resolve(line); },
        fail: (err) => { clearTimeout(timer); this.waiter = null; reject(err); },
      };
    });
  }

  // A worker error (failed load, script exception) ends any pending handshake or search at once.
  _onError(message) {
    const err = new Error(`engine worker error: ${message}`);
    if (this.waiter) this.waiter.fail(err);
    if (this.search) {
      const s = this.search;
      this.search = null;
      clearTimeout(s.timer);
      s.reject(err);
    }
    this.starting = null;
    this.ready = false;
  }

  _onLine(line) {
    if (this.waiter && line.startsWith(this.waiter.prefix)) this.waiter.done(line);
    if (line.startsWith('bestmove')) {
      if (this.stopping) { this.stopping = false; return; }
      if (this.search) this._finish(line.split(/\s+/)[1]);
      return;
    }
    if (!this.search) return;
    const info = parseInfo(line);
    if (!info) return;
    const k = info.multipv;
    if (k < 1 || k > this.multiPv) return;
    const cur = this.search.lines[k];
    if (!cur || info.depth >= cur.depth) this.search.lines[k] = info;
  }

  _finish(bestmove) {
    const s = this.search;
    this.search = null;
    clearTimeout(s.timer);
    const lines = s.lines.filter(Boolean);
    const maxDepth = Math.max(0, ...lines.map((l) => l.depth));
    // Only report lines from the deepest completed iteration.
    const sign = s.sideToMove === 'b' ? -1 : 1;
    const moves = [];
    for (let k = 1; k < s.lines.length; k++) {
      const l = s.lines[k];
      if (!l || l.depth !== maxDepth) continue;
      moves.push({
        rank: k,
        uci: l.pv[0],
        depth: l.depth,
        cp: l.cp ?? null,           // side-to-move POV, as reported by the engine
        mate: l.mate ?? null,
        whiteCp: l.cp === undefined ? null : sign * l.cp,     // White POV, for display
        whiteMate: l.mate === undefined ? null : sign * l.mate,
        pv: l.pv,
      });
    }
    s.resolve({ bestmove, depth: maxDepth, moves });
  }
}
