import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { setupOffline } from './lib/offline';
import { useStore } from './store';
import rgbDemo from './samples/rgb-mix.svg?raw';

setupOffline();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Start with the RGB demo so the room isn't empty on first visit.
useStore.getState().loadSvg(rgbDemo, 'rgb-mix.svg');

if (import.meta.env.DEV) {
  // Handy for debugging and scripted checks from the console.
  Object.assign(window, { goboLoom: useStore });
}
