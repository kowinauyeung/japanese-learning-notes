import { createBrowserRouter } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { Dictation, Flashcards, History, WordSets } from './routes/Placeholder';

// Routes follow the handoff. AppLayout gates everything below it on auth;
// /login sits outside so it stays reachable when signed out.
export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, lazy: () => import('./routes/Dashboard') },
      { path: 'vocabulary', lazy: () => import('./routes/Browse') },
      { path: 'vocabulary/:id', lazy: () => import('./routes/EntryDetail') },
      { path: 'account', lazy: () => import('./routes/Account') },
      { path: 'practice/flashcards', element: <Flashcards /> },
      { path: 'practice/dictation', element: <Dictation /> },
      { path: 'wordsets', element: <WordSets /> },
      { path: 'history', element: <History /> },
    ],
  },
  { path: '/login', lazy: () => import('./routes/Login') },
]);
