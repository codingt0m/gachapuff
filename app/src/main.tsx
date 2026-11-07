import '@fontsource-variable/pixelify-sans/wght.css';
import '@fontsource-variable/atkinson-hyperlegible-next/wght.css';
import './ui/styles/tokens.css';
import './ui/styles/base.css';
import './ui/styles/motion.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { gameConfig } from './config/gameConfig.ts';
import { Boot } from './ui/Boot.tsx';
import { ErrorBoundary } from './ui/ErrorBoundary.tsx';
import { applyDesignTokens } from './ui/theme.ts';

applyDesignTokens(gameConfig);

const root = document.getElementById('root');
if (!root) throw new Error('#root missing');

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <Boot />
    </ErrorBoundary>
  </StrictMode>,
);

if (import.meta.env.PROD) {
  void import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true }));
}
