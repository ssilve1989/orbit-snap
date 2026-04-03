/**
 * pwa.ts — PWA install prompt and service worker update toast.
 *
 * Call initPwa() once at startup. Both UI elements are self-contained DOM
 * nodes with inline styles; no external CSS required.
 *
 * Install button: appears bottom-right when the browser fires
 *   beforeinstallprompt. Hidden again after acceptance or appinstalled.
 *
 * Update toast: appears bottom-center when the service worker controller
 *   changes (i.e. a new SW has taken over), offering a one-click reload.
 */

// ─── Styles ──────────────────────────────────────────────────────────────────

const STYLES = `
#orbit-install-btn {
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 30;
  background: rgba(0, 0, 0, 0.7);
  border: 1px solid #00ffcc;
  font-family: monospace;
  font-size: 12px;
  letter-spacing: 3px;
  color: #00ffcc;
  padding: 10px 18px;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s, background 0.15s;
}
#orbit-install-btn:hover,
#orbit-install-btn:focus {
  background: rgba(0, 255, 204, 0.12);
  color: #fff;
  border-color: #fff;
  outline: none;
}

#orbit-update-toast {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 30;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 18px;
  background: #111;
  border: 1px solid #333;
  font-family: monospace;
  font-size: 11px;
  letter-spacing: 2px;
  color: #888;
  white-space: nowrap;
  animation: orbit-toast-in 200ms ease-out forwards;
}
@keyframes orbit-toast-in {
  from { opacity: 0; transform: translateX(-50%) translateY(8px); }
  to   { opacity: 1; transform: translateX(-50%) translateY(0); }
}
#orbit-update-toast-btn {
  background: none;
  border: 1px solid #555;
  font-family: monospace;
  font-size: 11px;
  letter-spacing: 2px;
  color: #00ffcc;
  padding: 3px 10px;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
}
#orbit-update-toast-btn:hover,
#orbit-update-toast-btn:focus {
  color: #fff;
  border-color: #00ffcc;
  outline: none;
}
`;

// ─── initPwa ─────────────────────────────────────────────────────────────────

export function initPwa(): void {
  const styleEl = document.createElement('style');
  styleEl.textContent = STYLES;
  document.head.appendChild(styleEl);

  initInstallButton();
  initUpdateToast();
}

// ─── Install button ───────────────────────────────────────────────────────────

function initInstallButton(): void {
  let deferredInstall: BeforeInstallPromptEvent | null = null;

  const btn = document.createElement('button');
  btn.id = 'orbit-install-btn';
  btn.textContent = 'INSTALL';
  btn.hidden = true;
  document.body.appendChild(btn);

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstall = e;
    btn.hidden = false;
  });

  btn.addEventListener('click', async () => {
    if (deferredInstall === null) return;
    await deferredInstall.prompt();
    const { outcome } = await deferredInstall.userChoice;
    if (outcome === 'accepted') {
      btn.hidden = true;
      deferredInstall = null;
    }
  });

  window.addEventListener('appinstalled', () => {
    btn.hidden = true;
    deferredInstall = null;
  });
}

// ─── Update toast ─────────────────────────────────────────────────────────────

function initUpdateToast(): void {
  if (!('serviceWorker' in navigator)) return;

  const hadController = Boolean(navigator.serviceWorker.controller);

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Ignore the very first activation (no previous controller = fresh install)
    if (!hadController) return;

    const toast = document.createElement('div');
    toast.id = 'orbit-update-toast';
    toast.innerHTML = 'UPDATE AVAILABLE <button id="orbit-update-toast-btn">RELOAD</button>';
    document.body.appendChild(toast);

    toast.querySelector('#orbit-update-toast-btn')?.addEventListener('click', () => {
      window.location.reload();
    });
  });
}
