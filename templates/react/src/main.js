import './style.css';
import { state, collect, ready } from './platform.js';
import React from 'react';
import { createRoot } from 'react-dom/client';
function Game() {
  const [position, setPosition] = React.useState({ left: '45%', top: '40%' });
  React.useEffect(() => { ready(); }, []);
  return React.createElement('div', { style: { position: 'relative', height: '100%' } }, React.createElement('button', { type: 'button', 'aria-label': 'Collect target', style: { position: 'absolute', ...position }, onClick: () => { collect(); if (!state.paused) setPosition({ left: `${Math.random() * 80}%`, top: `${Math.random() * 75}%` }); } }, 'Target'));
}
createRoot(document.querySelector('#game')).render(React.createElement(Game));
