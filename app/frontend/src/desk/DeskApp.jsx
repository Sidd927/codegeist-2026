// Article25 desk (Jira global page): product identity, navigation and routed views.
import { useEffect, useRef } from 'react';
import Lozenge from '@atlaskit/lozenge';
import { useRouter } from './router.jsx';
import { useResource } from '../shared/useResource.js';
import { api } from '../shared/api.js';
import { reportFirstContent } from '../shared/platform.js';
import { copy } from '../shared/copy/en.js';
import { Home } from './routes/Home.jsx';
import { Inbox } from './routes/Inbox.jsx';
import { Review } from './routes/Review.jsx';
import { Settings } from './routes/Settings.jsx';
import { NotFound } from './routes/NotFound.jsx';

const NAV = [
  { name: 'home', path: '/', label: copy.nav.home },
  { name: 'inbox', path: '/inbox', label: copy.nav.inbox, also: ['review'] },
  { name: 'settings', path: '/settings', label: copy.nav.settings, adminOnly: true },
];

export function DeskHeader({ appContext }) {
  const { route, navigate } = useRouter();
  const isAdmin = appContext?.roles?.jiraAdmin === true;
  const envLabel = appContext?.environment?.label;
  return (
    <header className="a25-desk__header">
      <div className="a25-desk__brand">
        <img src="./icon.svg" alt="" width="24" height="24" />
        <span className="a25-desk__product">{copy.product}</span>
        <span className="a25-desk__tagline a25-subtle">{copy.productTagline}</span>
        {envLabel ? <Lozenge appearance="new">{copy.common.environmentBadge(envLabel)}</Lozenge> : null}
      </div>
      <nav aria-label={copy.nav.mainLabel} className="a25-desk__nav">
        <ul>
          {NAV.filter((n) => !n.adminOnly || isAdmin).map((n) => {
            const current = route.name === n.name || n.also?.includes(route.name);
            return (
              <li key={n.name}>
                <button type="button" className="a25-desk__navlink" aria-current={current ? 'page' : undefined} onClick={() => navigate(n.path)}>
                  {n.label}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </header>
  );
}

export function DeskRoutes({ appContext }) {
  const { route, pathname } = useRouter();
  const mainRef = useRef(null);
  const firstRender = useRef(true);

  // Move focus to the new page heading on navigation (not on first load).
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    mainRef.current?.querySelector('h1')?.focus();
  }, [pathname]);

  let page;
  switch (route.name) {
    case 'home':
      page = <Home appContext={appContext} />;
      break;
    case 'inbox':
      page = <Inbox />;
      break;
    case 'review':
      page = <Review issueKey={route.params.issueKey} />;
      break;
    case 'settings':
      page = <Settings />;
      break;
    default:
      page = <NotFound />;
  }
  return (
    <main ref={mainRef} className="a25-desk__main">
      {page}
    </main>
  );
}

export default function DeskApp() {
  const ctx = useResource(() => api.appContext(), []);
  useEffect(() => {
    if (ctx.status !== 'loading') reportFirstContent('desk');
  }, [ctx.status]);
  return (
    <div className="a25-desk">
      <DeskHeader appContext={ctx.data} />
      <DeskRoutes appContext={ctx.data} />
    </div>
  );
}
