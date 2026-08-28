import { useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Avatar } from '@/components/Avatar';
import { BookIcon, HomeIcon, PlusIcon, PracticeIcon } from '@/components/icons';
import { Modal } from '@/components/Modal';
import { useI18n } from '@/i18n/context';
import type { MessageKey } from '@/i18n/messages';
import { useAuth } from '@/lib/auth';

/**
 * The phone's navigation, at the end of the screen the thumb can reach.
 *
 * It replaces a hamburger in the top bar, which on a modern phone is the
 * furthest point from the hand holding it — every destination in the app was
 * behind two taps at the top corner. The bar is the same five things a tab bar
 * anywhere is: where you are, what you have, what you are about to add, what
 * you practice, and everything else.
 *
 * **Five slots for seven destinations, and which two moved is the design.**
 * 単語集 and 履歴 are behind 「その他」 rather than in the bar, because they are
 * read occasionally and the other three are the daily loop. They are *not*
 * filed under the account menu: they are the notebook's own content, and an
 * account menu that contains word sets teaches the reader the wrong model of
 * where their words live. The sheet keeps them above a divider, with the
 * account below it.
 *
 * **The add button is a tab and not a floating button.** It used to float over
 * the bottom-right corner, where it covered whatever the page had put there —
 * measured on the practice setup, it sat on top of 終了日 and half of 開始する.
 * A bar occupies that strip honestly: the page ends above it.
 *
 * Above the `nav` breakpoint this renders nothing; the header's pill row and
 * its own ＋追加 are the navigation there.
 */
export function BottomNav({ onAdd }: { onAdd: () => void }) {
  const { t } = useI18n();
  const { pathname } = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);

  /**
   * `startsWith` and not `NavLink`, because the tab is not the route.
   * 練習 points at the flashcard setup but stands for both drills, and 単語
   * has to stay lit on a word's own page — a `NavLink` would light neither.
   */
  const active = (prefix: string) =>
    prefix === '/' ? pathname === '/' : pathname.startsWith(prefix);

  return (
    <>
      {/*
        Opaque, unlike the header. The header is translucent over a page that
        scrolls under it, which reads as depth; the same treatment down here
        put the page's own text through the tab labels — 「終了日 2026/08/28」
        legible between 学習サマリー and 単語 in a phone-width shot. A label a
        thumb is aiming at cannot be ambiguous about which layer it is on.

        Full bleed with the inset inside it, for the reason `index.css` gives
        about the header: a bar inset by its own margin leaves a strip of page
        showing under it, which on a notched phone is the home indicator's band
        drawn in the wrong colour. So the box reaches the edge and `pb-safe`
        moves only the row of tabs up out of it.
      */}
      <nav
        aria-label={t('nav.menu')}
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card px-safe pb-safe nav:hidden"
      >
        <div className="mx-auto flex max-w-md items-stretch justify-around px-2">
          {/* 「ホーム」 and not 「学習サマリー」: the pill row on a desktop has
              the width to name the screen, and a tab of about 60px does not.
              The label is the tab's, so it lives in its own message. */}
          <Tab to="/" label="nav.home" active={active('/')} icon={<HomeIcon />} />
          <Tab
            to="/vocabulary"
            label="nav.vocabulary"
            active={active('/vocabulary')}
            icon={<BookIcon />}
          />
          <AddTab onClick={onAdd} />
          <Tab
            to="/practice/flashcards"
            label="nav.practice"
            active={active('/practice')}
            icon={<PracticeIcon />}
          />
          <MoreTab
            onClick={() => setMoreOpen(true)}
            active={
              moreOpen ||
              ['/wordsets', '/history', '/account', '/settings'].some((path) => active(path))
            }
          />
        </div>
      </nav>

      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
    </>
  );
}

/**
 * `min-w-0` is what makes `truncate` on the label work: a flex item's automatic
 * minimum is its content, so without it the longest translation — 「学習サマリー」
 * in Japanese, `Mi progreso` in Spanish — grows its tab and prints over the one
 * beside it instead of being cut short.
 */
const tabClass = (active: boolean) =>
  `flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-panel px-1 pt-1.5 pb-1 text-[10px] font-medium ${
    active ? 'text-accent' : 'text-muted'
  }`;

function Tab({
  to,
  label,
  icon,
  active,
}: {
  to: string;
  label: MessageKey;
  icon: ReactNode;
  active: boolean;
}) {
  const { t } = useI18n();
  return (
    <Link to={to} aria-current={active ? 'page' : undefined} className={tabClass(active)}>
      {icon}
      <span className="max-w-full truncate">{t(label)}</span>
    </Link>
  );
}

/**
 * The add tab, drawn as the one filled control in the row.
 *
 * It is the only tab that does not navigate, so it does not look like the
 * others: the accent circle says "this does something" where the four line
 * icons say "this takes you somewhere". It keeps the label anyway, so the row
 * is five items of one height rather than four and a bump.
 */
function AddTab({ onClick }: { onClick: () => void }) {
  const { t } = useI18n();
  return (
    <button type="button" onClick={onClick} className={`${tabClass(false)} text-accent`}>
      <span className="grid h-7 w-7 place-items-center rounded-pill bg-accent text-on-accent">
        <PlusIcon />
      </span>
      <span className="max-w-full truncate">{t('action.add')}</span>
    </button>
  );
}

function MoreTab({ onClick, active }: { onClick: () => void; active: boolean }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const initial = (user?.displayName || user?.email || '?').charAt(0).toUpperCase();
  return (
    <button type="button" onClick={onClick} aria-expanded={active} className={tabClass(active)}>
      {/* Decorative: the label below it names the tab, and the account it
          pictures is named inside the sheet it opens. */}
      <Avatar photoUrl={user?.photoUrl} initial={initial} alt="" className="h-6 w-6 text-[10px]" />
      <span className="max-w-full truncate">{t('nav.more')}</span>
    </button>
  );
}

/**
 * Everything the bar has no room for, in the order a reader looks for it: the
 * notebook's own pages first, the account below a rule.
 */
function MoreSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const { signOutUser } = useAuth();
  const navigate = useNavigate();

  const go = (to: string) => {
    void navigate(to);
    onClose();
  };

  return (
    <Modal open={open} title={t('nav.more')} onClose={onClose}>
      <div className="space-y-1">
        <SheetItem label={t('nav.wordSets')} onClick={() => go('/wordsets')} />
        <SheetItem label={t('nav.history')} onClick={() => go('/history')} />
        <hr className="my-2 border-line" />
        <SheetItem label={t('account.account')} onClick={() => go('/account')} />
        <SheetItem label={t('account.settings')} onClick={() => go('/settings')} />
        <SheetItem label={t('account.signOut')} danger onClick={() => void signOutUser()} />
      </div>
    </Modal>
  );
}

function SheetItem({
  label,
  onClick,
  danger = false,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-12 w-full items-center rounded-panel px-3 text-base font-medium ${
        danger ? 'text-danger hover:bg-danger-soft' : 'text-ink hover:bg-bg-alt'
      }`}
    >
      {label}
    </button>
  );
}
