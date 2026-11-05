// Появление редактора не должно запускать анимацию смены экрана: страница мигала при первом открытии окна.
import { render, screen, waitFor } from '@testing-library/react';
import { ViewTransition } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/api/client', async () => (await import('@/shared/test/fakeSupabase')).fakeClientModule());

afterEach(() => {
  Reflect.deleteProperty(document, 'startViewTransition');
});

describe('появление редактора', () => {
  it('файл редактора ещё не загружен: анимация всей страницы не запускается', async () => {
    const start = vi.fn((update: () => void) => {
      update();
      const done = Promise.resolve();
      return { ready: done, finished: done, updateCallbackDone: done, skipTransition: () => {} };
    });
    Object.defineProperty(document, 'startViewTransition', { value: start, configurable: true });
    vi.resetModules();
    const { createTestQueryClient, manager, providers } = await import('@/shared/test');
    const { RichTextEditor } = await import('./RichText');
    const Wrapper = providers({ me: manager, queryClient: createTestQueryClient() });
    render(
      <Wrapper>
        <ViewTransition default="bs-page">
          <RichTextEditor ariaLabel="Описание" value="" />
        </ViewTransition>
      </Wrapper>,
    );
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Описание' })).toBeInTheDocument(), { timeout: 5000 });
    expect(start).not.toHaveBeenCalled();
  }, 15_000);
});
