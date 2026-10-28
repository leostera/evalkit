import { createRoot } from 'react-dom/client';

import { App } from './App.js';
import { createHttpDashboardApi } from './api.js';
import { createStaticDashboardApi } from './static-api.js';
import './app.css';

const root = document.querySelector('#root');
if (!root) throw new Error('Dashboard root is missing');

// `evalkit build` marks its index.html; `evalkit dev` serves the live API.
const api =
  document.documentElement.dataset.evalkitSnapshot === 'static'
    ? createStaticDashboardApi({ baseUrl: document.baseURI })
    : createHttpDashboardApi({ baseUrl: window.location.origin });

createRoot(root).render(<App api={api} />);
