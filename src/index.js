import React from 'react';
import ReactDOM from 'react-dom/client';
// Import Firebase configuration first to ensure it's initialized before the app
import './firebase';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
