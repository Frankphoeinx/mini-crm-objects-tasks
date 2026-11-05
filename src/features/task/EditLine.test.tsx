import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EditLine } from './EditLine';

function setup({ required = false, oneLine = false, save = vi.fn(async () => {}) } = {}) {
  const line = (value: string) => <EditLine aria-label="Поле" value={value} required={required} oneLine={oneLine} onSave={save} />;
  const view = render(line('Старое'));
  return { save, field: screen.getByRole('textbox', { name: 'Поле' }), setValue: (value: string) => view.rerender(line(value)), user: userEvent.setup() };
}

/** Ответ базы приходит, когда скажет тест. */
function heldSave() {
  let answer = () => {};
  const save = vi.fn(() => new Promise<void>((resolve) => (answer = resolve)));
  return { save, answer: () => act(async () => answer()) };
}

describe('EditLine: правка на месте (AC-13)', () => {
  it('сохраняет при уходе из поля, без пробелов по краям', async () => {
    const t = setup();
    await t.user.clear(t.field);
    await t.user.type(t.field, '  Новое  ');
    expect(t.save).not.toHaveBeenCalled();
    await t.user.tab();
    expect(t.save).toHaveBeenCalledExactlyOnceWith('Новое');
  });

  it.each([
    ['пустое обязательное', { required: true }, '', 'Старое'],
    ['пробелы в обязательном', { required: true }, '   ', 'Старое'],
    ['тот же текст с пробелами', {}, ' Старое ', 'Старое'],
  ])('не сохраняет: %s, поле возвращается', async (_name, options, typed, shown) => {
    const t = setup(options);
    await t.user.clear(t.field);
    if (typed) await t.user.type(t.field, typed);
    await t.user.tab();
    expect(t.save).not.toHaveBeenCalled();
    expect(t.field).toHaveValue(shown);
  });

  it('необязательное поле можно очистить', async () => {
    const t = setup();
    await t.user.clear(t.field);
    await t.user.tab();
    expect(t.save).toHaveBeenCalledExactlyOnceWith('');
  });

  it('без правок ничего не сохраняет', async () => {
    const t = setup();
    await t.user.click(t.field);
    await t.user.tab();
    expect(t.save).not.toHaveBeenCalled();
  });

  it('oneLine: Enter завершает правку один раз и не переносит строку', async () => {
    const t = setup({ oneLine: true });
    await t.user.type(t.field, ' правка{Enter}');
    expect(t.save).toHaveBeenCalledExactlyOnceWith('Старое правка');
    expect(t.field).not.toHaveFocus();
  });

  it('без oneLine Enter переносит строку и правку не завершает', async () => {
    const t = setup();
    await t.user.type(t.field, '{Enter}вторая');
    expect(t.save).not.toHaveBeenCalled();
    expect(t.field).toHaveFocus();
    expect(t.field).toHaveValue('Старое\nвторая');
  });

  it('фоновое обновление не трогает начатый ввод, а без ввода поле показывает свежее', async () => {
    const t = setup();
    t.setValue('Чужая правка');
    expect(t.field).toHaveValue('Чужая правка');

    await t.user.type(t.field, ' и моя');
    t.setValue('Ещё одна чужая');
    expect(t.field).toHaveValue('Чужая правка и моя');

    await t.user.tab();
    expect(t.save).toHaveBeenCalledExactlyOnceWith('Чужая правка и моя');
  });

  it('до ответа базы держит новый текст, после ответа показывает данные', async () => {
    const held = heldSave();
    const t = setup({ save: held.save });
    await t.user.type(t.field, ' правка');
    await t.user.tab();
    expect(t.field).toHaveValue('Старое правка');

    await held.answer();
    expect(t.field).toHaveValue('Старое');
    t.setValue('Старое правка');
    expect(t.field).toHaveValue('Старое правка');
  });

  it('новый ввод во время сохранения не пропадает при ответе', async () => {
    const held = heldSave();
    const t = setup({ save: held.save });
    await t.user.type(t.field, ' раз');
    await t.user.tab();
    await t.user.type(t.field, ' два');

    await held.answer();
    expect(t.field).toHaveValue('Старое раз два');
  });

  it.each([
    ['без field-sizing высоту считает скрипт', false, '96px'],
    ['с field-sizing высота остаётся за стилями', true, ''],
  ])('%s', (_name, supported, height) => {
    vi.spyOn(CSS, 'supports').mockReturnValue(supported);
    vi.spyOn(Element.prototype, 'scrollHeight', 'get').mockReturnValue(96);
    expect(setup().field.style.height).toBe(height);
  });
});
