// offscreen.js: runs the Stockfish Worker in the extension's own offscreen document.
// The popup and overlay send UCI commands through background.js, which connects here. Each connection gets its own Worker.
// Running the Worker here (an extension page, not an iframe on chess.com) is what stops "engine worker failed to load".
import { createLocalWorkerTransport, ENGINE_JS } from '../engine/uci-engine.js';

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'rockfish-offscreen') return;
  const transport = createLocalWorkerTransport(chrome.runtime.getURL(`engine/${ENGINE_JS}`));
  transport.setListener((line) => port.postMessage({ line }));
  transport.setErrorListener((error) => port.postMessage({ error }));
  port.onMessage.addListener((msg) => transport.send(msg.cmd));
  port.onDisconnect.addListener(() => transport.close());
});
