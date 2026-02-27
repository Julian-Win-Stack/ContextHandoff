import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import Overlay from './Overlay.tsx';
import './index.css';

const isOverlay =
  new URLSearchParams(window.location.search).get('overlay') === '1';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{isOverlay ? <Overlay /> : <App />}</React.StrictMode>
);
