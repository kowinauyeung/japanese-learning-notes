import { act, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { UpdatePrompt } from '@/components/UpdatePrompt';
import type { AppUpdatePort } from '@/domain/ports';
import { AppUpdateProvider } from '@/lib/appUpdate';
import { renderWithI18n as render } from '../helpers/renderWithI18n';

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

const mount = (port: AppUpdatePort) =>
  render(
    <AppUpdateProvider port={port}>
      <UpdatePrompt />
    </AppUpdateProvider>,
  );

const updateButton = () => screen.getByRole('button', { name: '今すぐ更新' });

describe('UpdatePrompt', () => {
  it('says nothing until a build is actually waiting, so nobody is offered the build they are already on', () => {
    const { port } = testPort();
    mount(port);

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

    expect(worker.activations()).toBe(1);
  });

  it('takes Later without activating, since the swap costs a reader mid-practice their session', () => {
    const worker = testPort();
    mount(worker.port);
    worker.announceWaitingBuild();

    act(() => screen.getByRole('button', { name: 'あとで' }).click());

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

    expect(screen.getByRole('status')).toHaveTextContent('新しいバージョンがあります');
  });
});
