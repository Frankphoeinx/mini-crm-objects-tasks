import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { makeObject, manager, otherWorker, worker } from '../../test';
import { Dialog } from '../Dialog';
import { objectOptions, personOptions, Picker, placePicker } from './Picker';

const options = personOptions([manager, worker, otherWorker], true);

function Host({ onPick = () => {}, value = worker.id, inDialog = false }: { onPick?: (id: string) => void; value?: string; inDialog?: boolean }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const picker = (
    <>
      <button onClick={(e) => setAnchor(e.currentTarget)}>Исполнитель</button>
      {anchor && <Picker anchor={anchor} options={options} value={value} onPick={onPick} onClose={() => setAnchor(null)} />}
    </>
  );
  return inDialog ? <Dialog title="Окно" onClose={() => {}}>{picker}</Dialog> : picker;
}

const open = () => fireEvent.click(screen.getByRole('button', { name: 'Исполнитель' }));
const option = (name: RegExp) => screen.getByRole('option', { name });

describe('placePicker', () => {
  const rect = (top: number, left = 100, width = 200) => ({ top, bottom: top + 44, left, width });

  it.each([
    // top + 44 + 6 + 4 * 56 + 12 = top + 286: граница места снизу при высоте окна 800.
    ['помещается снизу с запасом', 400, 450],
    ['ровно помещается снизу', 514, 564],
    ['на пиксель не помещается: вверх', 515, 515 - 236 - 6],
    ['нет места ни снизу, ни сверху: прижат к краю', 700 + 100, 800 - 236 - 6],
  ])('%s', (_name, top, expected) => {
    expect(placePicker(rect(top), 4, 1280, 800).top).toBe(expected);
  });

  it('вверх не уходит за край экрана', () => {
    expect(placePicker(rect(100), 12, 1280, 300).top).toBe(8);
  });

  it.each([
    ['ширина не меньше 280', rect(0, 100, 120), 280, 100],
    ['ширина кнопки больше', rect(0, 100, 400), 400, 100],
    ['правый край не вылезает', rect(0, 1200, 200), 280, 1280 - 280 - 8],
    ['левый край не вылезает', rect(0, -20, 200), 280, 8],
  ])('%s', (_name, anchor, width, left) => {
    expect(placePicker(anchor, 2, 1280, 800)).toMatchObject({ width, left });
  });
});

describe('варианты', () => {
  it('исполнители первыми, постановщик в конце, «Не назначен» только если можно снять', () => {
    expect(personOptions([manager, worker, otherWorker], true).map((o) => o.name)).toEqual(['Не назначен', 'Пётр Иванов', 'Сергей Козлов', 'Анна Смирнова']);
    expect(personOptions([manager, worker], false).map((o) => o.id)).toEqual([worker.id, manager.id]);
  });

  it('объекты с адресом', () => {
    expect(objectOptions([makeObject()])).toEqual([{ id: 'o1', name: 'ЖК Северный', sub: 'ул. Лесная, 14' }]);
  });
});

describe('Picker', () => {
  it('открывается с фокусом на текущем выборе и отмечает его', () => {
    render(<Host />);
    open();
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(option(/Пётр Иванов/)).toHaveFocus();
    expect(option(/Пётр Иванов/)).toHaveAttribute('aria-selected', 'true');
    expect(option(/Анна/)).toHaveAttribute('aria-selected', 'false');
  });

  it('без текущего выбора фокус на первом пункте', () => {
    render(<Host value="нет такого" />);
    open();
    expect(option(/Не назначен/)).toHaveFocus();
  });

  it('стрелки ходят по кругу, Home и End на края', () => {
    render(<Host />);
    open();
    const list = screen.getByRole('listbox');
    fireEvent.keyDown(list, { key: 'ArrowDown' });
    expect(option(/Сергей/)).toHaveFocus();
    fireEvent.keyDown(list, { key: 'ArrowDown' });
    fireEvent.keyDown(list, { key: 'ArrowDown' });
    expect(option(/Не назначен/)).toHaveFocus();
    fireEvent.keyDown(list, { key: 'ArrowUp' });
    expect(option(/Анна/)).toHaveFocus();
    fireEvent.keyDown(list, { key: 'Home' });
    expect(option(/Не назначен/)).toHaveFocus();
    fireEvent.keyDown(list, { key: 'End' });
    expect(option(/Анна/)).toHaveFocus();
  });

  it.each([
    ['Esc', () => fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' })],
    ['Tab', () => fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Tab' })],
    ['клик вне', () => fireEvent.click(screen.getByRole('button', { name: 'Закрыть список' }))],
  ])('%s закрывает и возвращает фокус на кнопку', (_name, close) => {
    const onPick = vi.fn();
    render(<Host onPick={onPick} />);
    open();
    close();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onPick).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Исполнитель' })).toHaveFocus();
  });

  it('выбор передаёт id, «Не назначен» передаёт пустую строку', () => {
    const onPick = vi.fn();
    render(<Host onPick={onPick} />);
    open();
    fireEvent.click(option(/Сергей/));
    expect(onPick).toHaveBeenLastCalledWith(otherWorker.id);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    open();
    fireEvent.click(option(/Не назначен/));
    expect(onPick).toHaveBeenLastCalledWith('');
  });

  it('прокрутка страницы закрывает, прокрутка самого списка нет', () => {
    render(<Host />);
    open();
    fireEvent.scroll(screen.getByRole('listbox'));
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    fireEvent.scroll(window);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('прокрутка соседнего поля не закрывает: кнопка на месте', () => {
    render(
      <>
        <textarea aria-label="Название" />
        <Host />
      </>,
    );
    open();
    fireEvent.scroll(screen.getByLabelText('Название'));
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('после закрытия фокус на кнопке, Esc и Tab в окне продолжают работать', () => {
    render(<Host />);
    open();
    fireEvent.scroll(window);
    expect(screen.getByRole('button', { name: 'Исполнитель' })).toHaveFocus();
  });

  it('смена размера окна закрывает', () => {
    render(<Host />);
    open();
    fireEvent(window, new Event('resize'));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('Esc внутри окна закрывает только список', () => {
    render(<Host inDialog />);
    open();
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(document.querySelector('.veil')).not.toHaveClass('is-closing');
  });

  it('пункт человека с аватаркой, пункт без исполнителя с пунктиром, объект со значком', () => {
    render(<Picker anchor={document.body} options={[...options, ...objectOptions([makeObject()])]} value="" onPick={() => {}} onClose={() => {}} />);
    expect(document.querySelector('.ava-s.is-none')).toBeInTheDocument();
    expect(document.querySelector('.ava-s.ava-petr')).toHaveTextContent('ПИ');
    expect(option(/ЖК Северный/).querySelector('.ava-s .ic')).toBeInTheDocument();
  });
});
