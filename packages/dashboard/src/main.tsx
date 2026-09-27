import { createRoot } from 'react-dom/client';

import { App } from './App.js';
import { createHttpDashboardApi } from './api.js';
import './styles.css';

const root = document.querySelector('#root');
if (!root) throw new Error('Dashboard root is missing');

createRoot(root).render(
  <App api={createHttpDashboardApi({ baseUrl: window.location.origin })} />,
);
