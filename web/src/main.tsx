import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
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
