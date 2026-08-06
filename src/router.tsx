import { createBrowserRouter } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';

// Routes from the handoff. Practice, word sets and history are Phase 2 — their
// entries are listed here so navigation and deep links settle now rather than
// after the screens land.
export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, lazy: () => import('./routes/Dashboard') },
      { path: 'vocabulary', lazy: () => import('./routes/Browse') },
      { path: 'vocabulary/:id', lazy: () => import('./routes/EntryDetail') },
    ],
  },
  { path: '/login', lazy: () => import('./routes/Login') },
]);
