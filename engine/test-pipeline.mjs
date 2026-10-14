// test-pipeline.mjs: runs uci-engine.js under Node on two positions and prints the top 3 moves.
// Usage: node chess-helper/engine/test-pipeline.mjs
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { UciEngine, createNodeTransport } from './uci-engine.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const DEPTH = 12;
const FENS = [
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',          // standard start position
  'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3',  // Italian Game, Black to move
];

function fmtScore(m) {
  if (m.mate !== null && m.mate !== undefined) return `mate ${m.mate}`;
  return `cp ${m.cp} (side to move)`;
}

const engine = new UciEngine(await createNodeTransport(here));
let failed = false;
try {
  await engine.start();
  console.log('engine ready (uciok + readyok, MultiPV set)');
  for (const fen of FENS) {
    const res = await engine.analyse(fen, DEPTH);
    console.log(`\nFEN: ${fen}`);
    console.log(`depth ${res.depth}, bestmove ${res.bestmove}`);
    if (res.moves.length !== 3) {
      failed = true;
      console.log(`FAIL: expected 3 lines, got ${res.moves.length}`);
    }
    for (const m of res.moves) {
      console.log(`  ${m.rank}. ${m.uci}  ${fmtScore(m)}  white-pov ${m.whiteMate !== null ? `mate ${m.whiteMate}` : `cp ${m.whiteCp}`}  pv ${m.pv.slice(0, 6).join(' ')}`);
    }
    if (res.moves[0] && res.moves[0].uci !== res.bestmove) {
      failed = true;
      console.log(`FAIL: rank 1 ${res.moves[0].uci} differs from bestmove ${res.bestmove}`);
    }
  }
} catch (e) {
  failed = true;
  console.error('ERROR:', e.message);
} finally {
  engine.close();
}
process.exit(failed ? 1 : 0);
