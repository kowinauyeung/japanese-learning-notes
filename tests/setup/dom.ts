import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

/**
 * Testing Library renders into a container appended to document.body and does
 * not remove it on its own outside of a framework with global teardown. Without
 * this, a second render in the same file finds two matching elements and every
 * `getBy*` throws a "found multiple elements" error that reads like a component
 * bug rather than a leak between tests.
 */
afterEach(cleanup);
