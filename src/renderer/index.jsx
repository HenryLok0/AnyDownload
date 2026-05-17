import React from 'react';
import { createRoot } from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';
import './index.css';
import i18n from './i18n';
import App from './App';

const container = document.getElementById('root');
const root = createRoot(container);
root.render(
  <React.StrictMode>
    <I18nextProvider i18n={i18n}>
      <App />
    </I18nextProvider>
  </React.StrictMode>
);
