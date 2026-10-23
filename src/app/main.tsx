import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { installTrustedTypes } from './trusted-types';
import '@/ui/styles/tokens.css';
import '@/ui/styles/base.css';
import './fatal.css';
import { App } from './App';
import { registerServiceWorkerAfterLoad } from './sw';

installTrustedTypes();

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

registerServiceWorkerAfterLoad();
