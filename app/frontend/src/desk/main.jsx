import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { view } from '@forge/bridge';
import '../shared/styles/base.css';
import '../shared/styles/components.css';
import './desk.css';
import DeskApp from './DeskApp.jsx';
import { RouterProvider, createMemoryHistory } from './router.jsx';
import { enableTheme } from '../shared/platform.js';

async function start() {
  enableTheme();
  let history;
  try {
    history = await view.createHistory(); // routes become part of the Jira URL (deep links, back/forward)
  } catch {
    history = createMemoryHistory('/');
  }
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <RouterProvider history={history}>
        <DeskApp />
      </RouterProvider>
    </StrictMode>,
  );
}
start();
