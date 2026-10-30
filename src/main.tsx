import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { setupOffline } from './lib/offline';

setupOffline();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if (import.meta.env.DEV) {
  // Handy for debugging and scripted checks from the console.
  import('./store').then(({ useStore }) => Object.assign(window, { goboLoom: useStore }));
}
