import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
// Self-hosted Exprsn Unified type families (BUG-038 — no external font
// origins; weights match the former Google Fonts <link> in index.html).
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import './styles/exprsn-unified.css';
import { Providers } from './app/providers';
import { router } from './app/router';
import { AuthGate } from './auth/AuthGate';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Providers>
      <AuthGate>
        <RouterProvider router={router} />
      </AuthGate>
    </Providers>
  </React.StrictMode>,
);
