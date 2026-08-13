import { createBrowserRouter } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';

// Routes follow the handoff. AppLayout gates everything below it on auth.
//
// Four documents and /login sit outside the gate, and that is the point of
// them: a privacy policy that cannot be read without signing in is not a
// public document, and Google's OAuth review expects both the policies and a
// homepage to be reachable by anyone. `/` itself is public when signed out —
// see AppLayout, which renders the landing page rather than redirecting.
export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, lazy: () => import('./routes/Dashboard') },
      { path: 'vocabulary', lazy: () => import('./routes/Browse') },
      { path: 'vocabulary/:id', lazy: () => import('./routes/EntryDetail') },
      { path: 'account', lazy: () => import('./routes/Account') },
      // One module for both modes; it rejects anything else in :mode. The nav
      // still links the two concrete paths.
      { path: 'practice/:mode', lazy: () => import('./routes/Practice') },
      { path: 'wordsets', lazy: () => import('./routes/WordSets') },
      { path: 'wordsets/:id', lazy: () => import('./routes/WordSetDetail') },
      { path: 'history', lazy: () => import('./routes/History') },
    ],
  },
  { path: '/login', lazy: () => import('./routes/Login') },
  { path: '/about', lazy: () => import('./routes/public/About') },
  { path: '/privacy', lazy: () => import('./routes/public/Privacy') },
  { path: '/terms', lazy: () => import('./routes/public/Terms') },
  { path: '/support', lazy: () => import('./routes/public/Support') },
]);
