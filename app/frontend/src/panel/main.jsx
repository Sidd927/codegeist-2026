import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../shared/styles/base.css';
import '../shared/styles/components.css';
import './panel.css';
import PanelApp from './PanelApp.jsx';
import { enableTheme } from '../shared/platform.js';

// Enable Jira's theme before first paint of content; render immediately (skeleton) either way.
enableTheme();
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <PanelApp />
  </StrictMode>,
);
