import { createRoot } from 'react-dom/client';

import { App } from './App.js';
import { createHttpDashboardApi } from './api.js';
import { createStaticDashboardApi } from './static-api.js';
import { readShareContext } from './share.js';
import './app.css';

const root = document.querySelector('#root');
if (!root) throw new Error('Dashboard root is missing');

// `evalkit build` marks its pages and sets `<base href>` to the snapshot root,
// so a snapshot works under any mount path. `evalkit dev` serves the live API.
// The share server also says where this commit's data lives (its API).
const snapshot = document.documentElement.dataset.evalkitSnapshot === 'static';
const share = readShareContext();
const api = snapshot
  ? createStaticDashboardApi({
      baseUrl: share?.data
        ? new URL(share.data, window.location.origin).href
        : document.baseURI,
    })
  : createHttpDashboardApi({ baseUrl: window.location.origin });
const basename = snapshot
  ? new URL(document.baseURI).pathname.replace(/\/$/, '') || undefined
  : undefined;

createRoot(root).render(<App api={api} basename={basename} share={share} />);
