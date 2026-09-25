import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import CursorTrail from './components/CursorTrail';
import './index.css';

// PWA: registrar service worker (solo en producción)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* noop */ });

    // Corte v1 -> v2: desregistrar el SW viejo del v1 y limpiar sus caches.
    // El SW del v1 era /service-worker.js (workbox, caches ah-pages/ah-static/ah-cdn);
    // el de la v2 es /sw.js, asi que solo tocamos lo que no sea nuestro.
    navigator.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach((reg) => {
        const url = reg.active?.scriptURL || reg.installing?.scriptURL || reg.waiting?.scriptURL || '';
        if (url.includes('service-worker.js') && !url.endsWith('/sw.js')) {
          reg.unregister();
        }
      });
    }).catch(() => { /* noop */ });

    if ('caches' in window) {
      caches.keys().then((names) => {
        names.forEach((n) => {
          if (n.startsWith('ah-') || n.includes('workbox')) caches.delete(n);
        });
      }).catch(() => { /* noop */ });
    }
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <CursorTrail />
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
