import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './components/App';
import { checkAndUpdateDictionaries } from './utils/dictUpdate';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Register service worker + dictionary auto-update in offline mode
if ((import.meta as any).env?.VITE_OFFLINE_MODE === 'true' && 'serviceWorker' in navigator) {
  // Listen for update notifications from the service worker
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'UPDATE_AVAILABLE') {
      console.log('[SW] New app version available:', event.data.version);
      window.location.reload();
    }
  });

  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');

      // Send CHECK_UPDATE to whichever SW is active/installing/waiting
      const sw = reg.active ?? reg.installing ?? reg.waiting;
      if (sw) {
        sw.postMessage({ type: 'CHECK_UPDATE' });
      } else {
        // First install: wait for the SW to become active then notify
        reg.addEventListener('updatefound', () => {
          const installing = reg.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            if (installing.state === 'activated') {
              installing.postMessage({ type: 'CHECK_UPDATE' });
            }
          });
        });
      }

      // Check and evict stale dictionary files from the SW cache
      await checkAndUpdateDictionaries();
    } catch (err) {
      console.error('[SW] Registration failed:', err);
    }
  });
}

