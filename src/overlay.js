// overlay.js: floats Chess Helper on top of the chess page as a draggable panel.
// Runs as a content script. background.js sends 'chess-helper:toggle-overlay' to show or hide it.
// It stays above the page because it lives in the page itself (browsers cannot make an extension window always-on-top).
(function () {
  'use strict';
  if (self.__chessHelperOverlay) return;
  self.__chessHelperOverlay = true;

  const TOGGLE = 'chess-helper:toggle-overlay';
  const ID = 'chess-helper-overlay';

  function build() {
    const box = document.createElement('div');
    box.id = ID;
    box.style.cssText = [
      'position:fixed', 'top:12px', 'right:12px', 'width:380px', 'height:720px',
      'max-height:94vh', 'min-width:300px', 'min-height:260px', 'z-index:2147483647',
      'display:flex', 'flex-direction:column', 'background:#1c1c1e', 'border-radius:14px',
      'box-shadow:0 12px 40px rgba(0,0,0,.55)', 'border:1px solid #3a3a3c',
      'overflow:hidden', 'resize:both'
    ].join(';');

    const bar = document.createElement('div');
    bar.style.cssText = 'display:flex;align-items:center;justify-content:space-between;height:26px;flex:none;padding:0 10px;background:#000;color:#98989d;font:600 11px -apple-system,system-ui,sans-serif;cursor:grab;user-select:none';
    bar.textContent = 'Rockfish  (drag to move)';

    const close = document.createElement('button');
    close.textContent = '\u00d7';
    close.title = 'Close';
    close.style.cssText = 'all:unset;cursor:pointer;color:#f5f5f7;font:700 16px/1 system-ui;padding:0 4px';
    close.addEventListener('click', () => box.remove());
    bar.append(close);

    const frame = document.createElement('iframe');
    frame.src = chrome.runtime.getURL('popup.html?overlay=1');
    frame.style.cssText = 'flex:1;width:100%;border:0;background:#1c1c1e';

    // Drag by the title bar. A shield stops the iframe from swallowing mouse moves mid-drag.
    bar.addEventListener('pointerdown', (e) => {
      if (e.target === close) return;
      const rect = box.getBoundingClientRect();
      const dx = e.clientX - rect.left;
      const dy = e.clientY - rect.top;
      bar.setPointerCapture(e.pointerId);
      bar.style.cursor = 'grabbing';
      frame.style.pointerEvents = 'none';
      const move = (ev) => {
        box.style.left = Math.max(0, Math.min(innerWidth - 60, ev.clientX - dx)) + 'px';
        box.style.top = Math.max(0, Math.min(innerHeight - 40, ev.clientY - dy)) + 'px';
        box.style.right = 'auto';
      };
      const up = () => {
        bar.releasePointerCapture(e.pointerId);
        bar.style.cursor = 'grab';
        frame.style.pointerEvents = '';
        bar.removeEventListener('pointermove', move);
        bar.removeEventListener('pointerup', up);
      };
      bar.addEventListener('pointermove', move);
      bar.addEventListener('pointerup', up);
    });

    box.append(bar, frame);
    return box;
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || msg.type !== TOGGLE) return false;
    const existing = document.getElementById(ID);
    if (existing) existing.remove();
    else document.documentElement.append(build());
    sendResponse({ ok: true, shown: !existing });
    return false;
  });
})();
