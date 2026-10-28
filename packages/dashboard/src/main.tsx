import { createRoot } from 'react-dom/client';

import { App } from './App.js';
import { createHttpDashboardApi } from './api.js';
import { createStaticDashboardApi } from './static-api.js';
import './app.css';

const root = document.querySelector('#root');
if (!root) throw new Error('Dashboard root is missing');

// `evalkit build` marks its pages and sets `<base href>` to the snapshot root,
// so a snapshot works under any mount path. `evalkit dev` serves the live API.
const snapshot = document.documentElement.dataset.evalkitSnapshot === 'static';
const api = snapshot
  ? createStaticDashboardApi({ baseUrl: document.baseURI })
  : createHttpDashboardApi({ baseUrl: window.location.origin });
const basename = snapshot
  ? new URL(document.baseURI).pathname.replace(/\/$/, '') || undefined
  : undefined;

createRoot(root).render(<App api={api} basename={basename} />);
