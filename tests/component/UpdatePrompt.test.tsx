import { act, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UpdatePrompt } from '@/components/UpdatePrompt';
import type { AppUpdatePort } from '@/domain/ports';
import { AppUpdateProvider } from '@/lib/appUpdate';
import { renderWithI18n as render } from '../fixtures/renderWithI18n';

/**
 * The port is implemented here rather than substituted for. `AppUpdatePort` is
 * a seam the architecture already has — `src/lib/backend.e2e.ts` implements the
 * same one for the end-to-end build — so this is standing in for a service
 * worker, not stubbing out `src/lib` or `src/components`.
 */
function testPort() {
  const listeners = new Set<() => void>();
  let activations = 0;
  const port: AppUpdatePort = {
    onWaiting(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    activate() {
      activations += 1;
      return Promise.resolve();
    },
  };
  return {
    port,
    /** What the worker does when a new build has installed and is waiting. */
    announceWaitingBuild: () => act(() => listeners.forEach((fn) => fn())),
    activations: () => activations,
  };
}

/**
 * A worker whose `activate()` rejects a fixed number of times before
 * succeeding — 0 for "always succeeds", `Infinity` for "always fails".
 */
function unreliablePort(failuresBeforeSuccess: number) {
  const listeners = new Set<() => void>();
  let attempts = 0;
  const port: AppUpdatePort = {
    onWaiting(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    activate() {
      attempts += 1;
      return attempts <= failuresBeforeSuccess
        ? Promise.reject(new Error('activation failed'))
        : Promise.resolve();
    },
  };
  return { port, announceWaitingBuild: () => act(() => listeners.forEach((fn) => fn())) };
}

/**
 * A worker whose `activate()` never settles on its own — the caller settles
 * each call in turn, in whatever order the test needs.
 */
function deferredPort() {
  const listeners = new Set<() => void>();
  const pending: { resolve: () => void; reject: (error: Error) => void }[] = [];
  const port: AppUpdatePort = {
    onWaiting(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    activate() {
      return new Promise<void>((resolve, reject) => {
        pending.push({ resolve, reject });
      });
    },
  };
  return { port, pending, announceWaitingBuild: () => act(() => listeners.forEach((fn) => fn())) };
}

/**
 * `noUncheckedIndexedAccess` makes `pending[i]` possibly `undefined`. A silent
 * `?.` would let the test pass vacuously if a click somehow failed to reach
 * the port, so this throws instead of hiding that.
 */
function nth<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (!item) throw new Error(`expected an item at index ${index}, got ${items.length} total`);
  return item;
}

const mount = (port: AppUpdatePort) =>
  render(
    <AppUpdateProvider port={port}>
      <UpdatePrompt />
    </AppUpdateProvider>,
  );

const updateButton = () => screen.getByRole('button', { name: '今すぐ更新' });
const FAILED = '自動更新に失敗しました。ページを再読み込みして新しいバージョンを取得してください。';

describe('UpdatePrompt', () => {
  it('says nothing until a build is actually waiting, so nobody is offered the build they are already on', () => {
    const { port } = testPort();
    mount(port);

    // Absence is the whole assertion. A banner with no waiting build offers the
    // reader an update to the build they are already running — and the only
    // thing the button could do is reload them onto the same code, which reads
    // as the app being broken rather than as nothing having happened.
    expect(screen.queryByText('新しいバージョンがあります')).not.toBeInTheDocument();
  });

  it('appears once a build is waiting, which is the only signal a controlled client ever gets', () => {
    const worker = testPort();
    mount(worker.port);

    worker.announceWaitingBuild();

    expect(screen.getByText('新しいバージョンがあります')).toBeInTheDocument();
  });

  it('hands over to the waiting build, because reloading re-serves the precached one instead', () => {
    const worker = testPort();
    mount(worker.port);
    worker.announceWaitingBuild();

    act(() => updateButton().click());

    // Counted at the port, because the screen cannot tell the difference: a
    // button that dismissed instead of handing over looks identical, and the
    // reader only finds out when the build they asked for is still not there.
    expect(worker.activations()).toBe(1);
  });

  it('takes Later without activating, since the swap costs a reader mid-practice their session', () => {
    const worker = testPort();
    mount(worker.port);
    worker.announceWaitingBuild();

    act(() => screen.getByRole('button', { name: 'あとで' }).click());

    // Absence again, and it is what makes "Later" mean anything. A banner that
    // stayed up would leave the reader no way to defer: the only control that
    // cleared it would be the one that reloads them mid-practice.
    expect(screen.queryByText('新しいバージョンがあります')).not.toBeInTheDocument();
    // Zero, and counted rather than inferred from the banner going away. A
    // "Later" that dismissed *and* handed over would look identical on screen
    // for the moment before the page reloaded underneath the reader — which is
    // the swap they just declined, arriving anyway.
    expect(worker.activations()).toBe(0);
  });

  /**
   * Not a styling assertion. The banner arrives while the reader is mid-task —
   * that is the only moment it can arrive — and an assertive live region would
   * cut into a dictation answer to talk about deployment. `role="status"` is
   * polite by default, so it is announced at the next pause instead.
   */
  it('announces politely rather than interrupting, because it always arrives mid-task', () => {
    const worker = testPort();
    mount(worker.port);
    worker.announceWaitingBuild();

    // Queried by role rather than by text, and that is the assertion. `status`
    // is a polite live region: a screen reader announces it at the next pause.
    // Lose the role and the banner is either silent to a screen reader, or —
    // if someone reaches for `alert` — cuts into the dictation answer being
    // typed, which is the one moment this can arrive.
    expect(screen.getByRole('status')).toHaveTextContent('新しいバージョンがあります');
  });

  /**
   * `activate()` never replaces the page on this path — the rejection is the
   * only thing that happened — so a reader who clicked and got nothing back
   * needs the banner itself to say so, or the click reads as having done
   * nothing at all.
   */
  it('tells the reader activation failed instead of leaving the button looking inert', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const worker = unreliablePort(Infinity);
    mount(worker.port);
    worker.announceWaitingBuild();

    act(() => updateButton().click());

    expect(await screen.findByText(FAILED)).toBeInTheDocument();
  });

  /**
   * The failure is cleared at the start of the next attempt, not only on
   * success, so a reader who retries and this time gets through is not left
   * looking at an error banner above a page that is about to reload anyway.
   */
  it('clears the failure message on the next attempt', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const worker = unreliablePort(1);
    mount(worker.port);
    worker.announceWaitingBuild();

    act(() => updateButton().click());
    expect(await screen.findByText(FAILED)).toBeInTheDocument();

    act(() => updateButton().click());

    await waitFor(() => expect(screen.queryByText(FAILED)).not.toBeInTheDocument());
  });

  /**
   * The button is not disabled between clicks, so a reader who clicks twice
   * starts a second attempt before the first has settled — and a `Promise`
   * carries no guarantee it settles in the order it was created. A late
   * rejection from the first click must not overwrite the outcome of the
   * second, already-successful one.
   */
  it('ignores a stale rejection from an attempt a later one has already superseded', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const worker = deferredPort();
    mount(worker.port);
    worker.announceWaitingBuild();

    act(() => updateButton().click());
    act(() => updateButton().click());

    await act(async () => {
      nth(worker.pending, 1).resolve();
      await Promise.resolve();
    });
    await act(async () => {
      nth(worker.pending, 0).reject(new Error('stale, superseded activation'));
      await Promise.resolve();
    });

    expect(screen.queryByText(FAILED)).not.toBeInTheDocument();
  });

  // Restores unconditionally, so a failed assertion above can't leak the
  // `console.error` mock into whichever test runs next.
  afterEach(() => {
    vi.restoreAllMocks();
  });
});
