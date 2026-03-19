import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import './index.css';

const isLocalhost = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);

if ('serviceWorker' in navigator && (window.isSecureContext || isLocalhost)) {
  registerSW({ immediate: true });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);