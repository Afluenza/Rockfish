// candidate.js: win-chance helpers used by the eval bar. This is our approximation of chess.com's Expected
// Points model, not chess.com's own rule. Pure functions, so tests can run them under Node.

// Logistic scale that maps centipawns to win chance (the common lichess-style curve). Approximation only.
export const WIN_SCALE = 0.00368208;

// Win chance (0..1) from a side-to-move centipawn score.
export function winChance(cp) {
  return 1 / (1 + Math.exp(-WIN_SCALE * cp));
}

// Win chance for one ranked line. A forced mate for the side to move is a certain win, against is a certain loss.
export function lineWinChance(line) {
  if (line.mate !== null && line.mate !== undefined) return line.mate > 0 ? 1 : 0;
  return winChance(line.cp);
}
