// background.js: opens Chess Helper when the toolbar icon is clicked.
// On a chess.com or lichess.org tab it floats a panel on top of the page (this is the "stay on top" mode:
// a browser extension window cannot be forced above the browser, a panel inside the page can).
// Elsewhere it uses the side panel if the browser has one, else a small separate window.
// It also relays engine traffic: each popup/overlay port is paired with a port to the offscreen document, which runs the Worker.

const SITE = /^https:\/\/(www\.chess\.com|lichess\.org)\//;
const TOGGLE = 'chess-helper:toggle-overlay';

function openFallbackWindow() {
  chrome.windows
    .create({ url: chrome.runtime.getURL('popup.html'), type: 'popup', width: 380, height: 760 })
    .catch((err) => console.error('Chess Helper: could not open fallback window', err));
}

async function toggleOverlay(tab) {
  try {
    await chrome.tabs.sendMessage(tab.id, { type: TOGGLE });
    return true;
  } catch {
    // Tab was open before the extension loaded: inject the scripts, then try again.
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['src/selectors.js', 'src/content.js', 'src/overlay.js']
      });
      await chrome.tabs.sendMessage(tab.id, { type: TOGGLE });
      return true;
    } catch (err) {
      console.error('Chess Helper: overlay failed', err);
      return false;
    }
  }
}

async function openUi(tab) {
  if (tab && tab.id !== undefined && SITE.test(tab.url || '') && (await toggleOverlay(tab))) return;
  if (chrome.sidePanel && typeof chrome.sidePanel.open === 'function') {
    try {
      await chrome.sidePanel.open({ windowId: tab.windowId });
      return;
    } catch (err) {
      console.error('Chess Helper: side panel did not open, using a window instead', err);
    }
  }
  openFallbackWindow();
}

// The window's "Float on page" button asks for the overlay on the chess tab.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== 'chess-helper:float') return false;
  chrome.tabs.query({ url: ['https://www.chess.com/*', 'https://lichess.org/*'] }).then(async (tabs) => {
    const tab = tabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))[0];
    sendResponse({ ok: !!tab && (await toggleOverlay(tab)) });
  });
  return true;
});

// Creates the offscreen document once. Two popups may ask at the same moment, so a failed create is accepted if one now exists.
async function ensureOffscreen() {
  if (await chrome.offscreen.hasDocument()) return;
  try {
    await chrome.offscreen.createDocument({
      url: 'src/offscreen.html',
      reasons: ['WORKERS'],
      justification: 'Run the Stockfish engine Worker for chess analysis'
    });
  } catch (err) {
    if (!(await chrome.offscreen.hasDocument())) throw err;
  }
}

// Connects to the offscreen document. Right after it is created its script may not be listening yet,
// so a connection that drops before the document answers { ready: true } is retried.
async function connectOffscreen() {
  await ensureOffscreen();
  for (let attempt = 1; attempt <= 5; attempt++) {
    const port = chrome.runtime.connect({ name: 'rockfish-offscreen' });
    const ready = await new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), 1500);
      port.onMessage.addListener(function onFirst(msg) {
        if (!msg || !msg.ready) return;
        port.onMessage.removeListener(onFirst);
        clearTimeout(timer);
        resolve(true);
      });
      port.onDisconnect.addListener(() => {
        clearTimeout(timer);
        resolve(false);
      });
    });
    if (ready) return port;
    port.disconnect();
    await new Promise((r) => setTimeout(r, 300 * attempt));
  }
  throw new Error('offscreen engine did not answer after 5 tries');
}

// Each popup/overlay connection gets its own port to the offscreen document. Messages wait until that port is ready.
chrome.runtime.onConnect.addListener((popupPort) => {
  if (popupPort.name !== 'rockfish-engine') return;
  const offscreenPort = connectOffscreen().then((port) => {
    port.onMessage.addListener((msg) => {
      if (msg.ready) return;
      try { popupPort.postMessage(msg); } catch { /* popup closed */ }
    });
    port.onDisconnect.addListener(() => {
      try { popupPort.postMessage({ error: 'engine stopped' }); } catch { /* popup closed */ }
    });
    return port;
  });
  offscreenPort.catch((err) => {
    console.error('Chess Helper: offscreen engine failed to start', err);
    try { popupPort.postMessage({ error: `offscreen engine failed to start: ${err.message}` }); } catch { /* popup closed */ }
  });
  popupPort.onMessage.addListener((msg) => {
    offscreenPort.then((port) => port.postMessage(msg)).catch(() => {});
  });
  popupPort.onDisconnect.addListener(() => {
    offscreenPort.then((port) => port.disconnect()).catch(() => {});
  });
});

chrome.action.onClicked.addListener(openUi);
