import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

afterEach(cleanup);

// jsdom не умеет прокрутку окна, её вызывает ScrollRestoration.
vi.stubGlobal('scrollTo', () => {});
