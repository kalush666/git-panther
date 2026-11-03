import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './app/App';
import './app/global.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('index.html must contain a #root element');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
