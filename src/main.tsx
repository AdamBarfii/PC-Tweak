import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { OverlayView } from './features/overlay/OverlayView';
import './index.css';
import './i18n';

const isOverlay =
  window.location.search.includes('overlay=true') ||
  window.location.hash.includes('overlay') ||
  window.location.href.includes('overlay');

if (isOverlay) {
  document.documentElement.classList.add('dark', 'overlay-window');
  document.body.classList.add('overlay-window');
  document.documentElement.style.background = 'transparent';
  document.body.style.background = 'transparent';
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isOverlay ? <OverlayView /> : <App />}
  </React.StrictMode>
);
