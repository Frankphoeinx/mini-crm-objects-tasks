import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeleteDialog } from './DeleteDialog';
import { Dialog } from './Dialog';

function Host({ onClose = () => {}, busy = false }: { onClose?: () => void; busy?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Открыть</button>
      {open && (
        <Dialog
          title="Новый объект"
          busy={busy}
          onClose={() => {
            setOpen(false);
            onClose();
          }}
        >
          {(requestClose) => (
            <form>
              <h2>Новый объект</h2>
              <input aria-label="Название" />
              <button type="button" className="btn" onClick={requestClose}>
                Отмена
              </button>
              <button type="button" className="btn">
                Сохранить
              </button>
            </form>
          )}
        </Dialog>
      )}
    </>
  );
}

const open = () => fireEvent.click(screen.getByRole('button', { name: 'Открыть' }));

describe('Dialog', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('подписан и забирает фокус на первое поле', () => {
    render(<Host />);
    open();
    expect(screen.getByRole('dialog', { name: 'Новый объект' })).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByLabelText('Название')).toHaveFocus();
  });

  it.each([
    ['Esc', () => fireEvent.keyDown(screen.getByLabelText('Название'), { key: 'Escape' })],
    ['кнопка отмены', () => fireEvent.click(screen.getByRole('button', { name: 'Отмена' }))],
  ])('%s: сначала анимация, потом закрытие и фокус на прежнем месте', (_name, close) => {
    const onClose = vi.fn();
    render(<Host onClose={onClose} />);
    screen.getByRole('button', { name: 'Открыть' }).focus();
    open();

    close();
    expect(document.querySelector('.veil')).toHaveClass('is-closing');
    expect(onClose).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(120));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Открыть' })).toHaveFocus();
  });

  it('пока идёт запрос, не закрывается', () => {
    const onClose = vi.fn();
    render(<Host onClose={onClose} busy />);
    open();
    fireEvent.keyDown(screen.getByLabelText('Название'), { key: 'Escape' });
    act(() => vi.advanceTimersByTime(500));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Tab ходит по кругу внутри окна', () => {
    render(<Host />);
    open();
    const save = screen.getByRole('button', { name: 'Сохранить' });
    const name = screen.getByLabelText('Название');

    save.focus();
    fireEvent.keyDown(save, { key: 'Tab' });
    expect(name).toHaveFocus();

    fireEvent.keyDown(name, { key: 'Tab', shiftKey: true });
    expect(save).toHaveFocus();
  });

  it('из поля с разметкой Tab идёт дальше, а не прыгает на первое поле', () => {
    render(
      <Dialog title="Окно" onClose={() => {}}>
        <input aria-label="Название" />
        <div role="textbox" aria-label="Описание" contentEditable suppressContentEditableWarning tabIndex={0} />
        <button type="button">Сохранить</button>
      </Dialog>,
    );
    const field = screen.getByRole('textbox', { name: 'Описание' });
    field.focus();
    // true: обработчик окна не вмешался, дальше фокус ведёт браузер.
    expect(fireEvent.keyDown(field, { key: 'Tab' })).toBe(true);
    expect(field).toHaveFocus();
  });

  it('фокус на подложке: Tab возвращает его в окно', () => {
    render(<Host />);
    open();
    const veil = document.querySelector<HTMLElement>('.veil') as HTMLElement;
    veil.focus();
    fireEvent.keyDown(veil, { key: 'Tab' });
    expect(screen.getByLabelText('Название')).toHaveFocus();
  });
});

describe('DeleteDialog', () => {
  it('показывает, что скроется вместе с объектом, и подтверждает', () => {
    const onConfirm = vi.fn();
    render(
      <DeleteDialog
        title="Удалить объект «ЖК Северный»?"
        text="Вместе с объектом скроются 2 задачи."
        items={[
          { id: 't1', status: 'new', title: 'Первая' },
          { id: 't2', status: 'work', title: 'Вторая' },
        ]}
        onConfirm={onConfirm}
        onClose={() => {}}
      />,
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Удалить' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('без списка списка нет, отказ базы виден, во время запроса кнопки выключены', () => {
    render(<DeleteDialog title="Удалить?" text="Текст" busy error="Это действие доступно постановщику" onConfirm={() => {}} onClose={() => {}} />);
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Это действие доступно постановщику');
    expect(screen.getByRole('button', { name: 'Удалить' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Отмена' })).toBeDisabled();
  });
});
