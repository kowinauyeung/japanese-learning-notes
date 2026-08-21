import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
// `@/lib/backend`, not `./lib/backend`. The end-to-end alias matches the
// absolute specifier only, so the relative form resolves straight to the real
// module and quietly takes Firebase and the service worker into a build that is
// supposed to have neither.
import { appUpdatePort } from '@/lib/backend';
import { OfflineNotice } from './components/OfflineNotice';
import { UpdatePrompt } from './components/UpdatePrompt';
import { I18nProvider } from './i18n/I18nProvider';
import { AppUpdateProvider } from './lib/appUpdate';
import { AuthProvider } from './lib/auth';
import { router } from './router';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <AppUpdateProvider port={appUpdatePort}>
        <I18nProvider>
          {/*
            Outside the router, because a waiting build is a fact about the tab
            and not about the route: a reader sitting on /login or /privacy is
            just as stuck on the old build as one mid-practice.

            The cost of that placement is the locale. This reads the browser's
            language, while a signed-in reader's pages read the one saved in
            their profile — so someone whose device is English and whose app is
            set to 日本語 gets an English banner. Moving it inside the
            authenticated tree would fix that and lose the public routes, which
            is the worse half of the trade for four short strings.
          */}
          <UpdatePrompt />
          {/*
            Beside the update prompt and for the same reasons: being offline is
            a fact about the device, not about the route, and the locale
            trade-off above applies unchanged.
          */}
          <OfflineNotice />
          <RouterProvider router={router} />
        </I18nProvider>
      </AppUpdateProvider>
    </AuthProvider>
  </StrictMode>,
);
