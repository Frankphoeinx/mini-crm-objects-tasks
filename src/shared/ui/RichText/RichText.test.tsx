import { Editor } from '@tiptap/react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Suspense, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '@/shared/api/client';
import { createTestQueryClient, manager, providers } from '@/shared/test';
import type { FakeSupabase } from '@/shared/test/fakeSupabase';
import { richTextExtensions } from './extensions';
import { RichTextView as LazyRichTextView, type RichTextEditorProps } from './RichText';
import RichTextEditor from './RichTextEditor';
import RichTextView from './RichTextView';

vi.mock('@/shared/api/client', async () => (await import('@/shared/test/fakeSupabase')).fakeClientModule());
const fake = supabase as unknown as FakeSupabase;

const USER = '11111111-1111-1111-1111-111111111111';
const PATH = `${USER}/22222222-2222-2222-2222-222222222222.png`;
const me = { ...manager, id: USER };

const created: Editor[] = [];
function editorFor(markdown: string) {
  const editor = new Editor({ extensions: richTextExtensions(), content: markdown, contentType: 'markdown' });
  created.push(editor);
  return editor;
}
const visible = (editor: Editor) => editor.getText({ blockSeparator: '\n\n' });

beforeEach(() => fake.reset());
afterEach(() => {
  created.splice(0).forEach((editor) => editor.destroy());
  vi.unstubAllGlobals();
});

describe('разбор Markdown', () => {
  it.each([
    ['перенос строки', 'Первое\nВторое'],
    ['пустая строка между абзацами', 'Первое\n\nВторое'],
    ['дробь с запятой', '3,5 на 4 метра'],
    ['размеры через звёздочку', 'Плита 3*5*2 м'],
    ['звёздочки с пробелами', '2 * 3 * 4'],
    ['одна звёздочка', 'пять* штук'],
    ['код', 'Команда `ls` тут'],
    ['блок кода отступом', 'Текст\n\n    отступ'],
    ['блок кода', '```\nкод\n```'],
    ['черта', '---'],
    ['строка и черта', 'Итого\n---'],
    ['цитата', '> важно'],
    ['зачёркивание', '~~старое~~'],
    ['ссылка', '[смета](https://example.com)'],
    ['адрес', 'https://example.com/a'],
    ['адрес в скобках', '<https://example.com>'],
    ['определение ссылки', '[x]: https://example.com'],
    ['таблица', '| а | б |\n|---|---|\n| 1 | 2 |'],
  ])('простой текст не теряет знаков и переживает круг: %s', (_name, source) => {
    const first = editorFor(source);
    expect(() => first.state.doc.check()).not.toThrow();
    const text = visible(first);
    // Отступ и переносы редактор показывает своими средствами, важно само содержимое.
    expect(text.replace(/\s+/g, ' ').trim()).toBe(source.replace(/\s+/g, ' ').trim());

    const markdown = first.getMarkdown();
    const second = editorFor(markdown);
    expect(visible(second)).toBe(text);
    expect(second.getMarkdown()).toBe(markdown);
  });

  it.each([
    ['пустой флажок', '- [ ] сделать', '[ ] сделать'],
    ['отмеченный флажок', '- [x] готово', '[x] готово'],
    ['флажки через пустую строку', '- [ ] а\n\n- [x] б', '[ ] а'],
  ])('задача остаётся пунктом с теми же буквами: %s', (_name, source, text) => {
    const editor = editorFor(source);
    expect(() => editor.state.doc.check()).not.toThrow();
    expect(editor.getJSON().content?.[0]?.type).toBe('bulletList');
    expect(editor.getText()).toContain(text);
    expect(editorFor(editor.getMarkdown()).getText()).toBe(editor.getText());
  });

  it('перенос строки становится переносом, а не пробелом', () => {
    const editor = editorFor('Первое\nВторое');
    expect(editor.getJSON().content?.[0]?.content?.map((node) => node.type)).toEqual(['text', 'hardBreak', 'text']);
  });

  it.each(['*важно*', '**важно**', '2*3', '_важно_', '# не заголовок', '- не список', '+ не список', '* не список', '1. не список', '2) не список', '<b>жирный</b>', '&lt;', 'a\\b'])('набранный руками текст %s остаётся буквами', (typed) => {
    const editor = editorFor('');
    editor.commands.insertContent({ type: 'text', text: typed });
    const again = editorFor(editor.getMarkdown());
    expect(visible(again)).toBe(typed);
  });

  it.each([
    ['жирный', '**важно**', 'bold'],
    ['курсив', '*важно*', 'italic'],
  ])('%s в Markdown становится оформлением', (_name, source, mark) => {
    const editor = editorFor(source);
    expect(editor.getJSON().content?.[0]?.content?.[0]?.marks?.[0]?.type).toBe(mark);
    expect(visible(editor)).toBe('важно');
    expect(editor.getMarkdown()).toBe(source);
  });

  it.each([
    ['заголовок', '## Этап', 'heading'],
    ['маркированный список', '- кирпич\n- цемент', 'bulletList'],
    ['нумерованный список', '1. кирпич\n2. цемент', 'orderedList'],
  ])('%s переживает круг', (_name, source, type) => {
    const editor = editorFor(source);
    expect(editor.getJSON().content?.[0]?.type).toBe(type);
    expect(editor.getMarkdown()).toBe(source);
  });

  it.each([
    ['одна', `![](${PATH})`],
    ['с текстом вокруг', `До ![](${PATH}) после`],
    ['в списке', `- ![](${PATH})`],
    ['в заголовке', `## ![](${PATH})`],
    ['после переноса', `Текст\n![](${PATH})`],
  ])('путь картинки переживает круг без экранирования (на этом стоит правило базы): %s', (_name, source) => {
    const editor = editorFor(source);
    // Документ правильный: иначе правка рядом с картинкой упала бы.
    expect(() => editor.state.doc.check()).not.toThrow();
    expect(editor.getMarkdown()).toContain(`![](${PATH})`);
    expect(editorFor(editor.getMarkdown()).getMarkdown()).toContain(`![](${PATH})`);
  });
});

function renderWithClient(ui: React.ReactElement) {
  return render(<Suspense fallback={null}>{ui}</Suspense>, { wrapper: providers({ me, queryClient: createTestQueryClient() }) });
}

describe('показ описания', () => {
  it('пока редактор грузится, описание уже видно обычным текстом', async () => {
    const { container } = renderWithClient(<LazyRichTextView value={'**Важно**\nВторая строка'} />);
    expect(container.querySelector('.rt-plain')?.textContent).toBe('Важно\nВторая строка');
    expect(await screen.findByText('Важно', { selector: 'strong' })).toBeInTheDocument();
    expect(container.querySelector('.rt-plain')).toBeNull();
  });

  it.each([
    ['картинка с обработчиком', '<img src=x onerror=alert(1)>'],
    ['скрипт', '<script>alert(1)</script>'],
    ['жирный тег', '<b>жирный</b>'],
    ['ссылка с кодом', '<a href="javascript:alert(1)">x</a>'],
    ['блок', '<div onclick="alert(1)">x</div>'],
    ['markdown-ссылка с кодом', '[x](javascript:alert(1))'],
    ['автоссылка с кодом', '<javascript:alert(1)>'],
  ])('HTML остаётся текстом и не выполняется: %s', (_name, source) => {
    const alert = vi.fn();
    vi.stubGlobal('alert', alert);
    const { container } = renderWithClient(<RichTextView value={source} />);
    expect(container.querySelector('img, script, a, b, div[onclick], [onerror]')).toBeNull();
    expect(container).toHaveTextContent(source);
    expect(alert).not.toHaveBeenCalled();
  });

  it('только чтение: поля и панели нет, оформление и переносы видны', () => {
    const { container } = renderWithClient(<RichTextView value={'**Важно**\nВторая строка'} />);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(container.querySelector('[contenteditable="true"]')).toBeNull();
    expect(container.querySelector('strong')).toHaveTextContent('Важно');
    expect(container.querySelector('br')).not.toBeNull();
    expect(container.querySelector('.tk-desc')).not.toBeNull();
  });

  it('новый текст из базы заменяет прежний', () => {
    const { container, rerender } = renderWithClient(<RichTextView value="Старое" />);
    rerender(<Suspense fallback={null}><RichTextView value="Новое" /></Suspense>);
    expect(container).toHaveTextContent('Новое');
    expect(container).not.toHaveTextContent('Старое');
  });

  it('своя картинка: загрузка, затем адрес объекта из хранилища', async () => {
    const { container } = renderWithClient(<RichTextView value={`![](${PATH})`} />);
    expect(await screen.findByText('Загружаем картинку…')).toBeInTheDocument();
    await waitFor(() => expect(container.querySelector('img[src]')).toHaveAttribute('src', 'blob:test-image'));
    expect(fake.calls('storage')).toEqual([{ target: 'storage', method: 'download', args: [PATH] }]);
    expect(screen.getByRole('img')).toHaveAccessibleName('Картинка из описания');
  });

  it('отказ хранилища: «Картинка недоступна»', async () => {
    fake.respond('storage', { data: null, error: { message: 'no', status: 400 } });
    renderWithClient(<RichTextView value={`![](${PATH})`} />);
    expect(await screen.findByText('Картинка недоступна')).toBeInTheDocument();
  });

  it.each(['https://evil.example/x.png', '//evil.example/x.png', 'javascript:alert(1)'])('чужой адрес %s сразу «Картинка недоступна», запроса нет', async (src) => {
    const network = vi.fn();
    vi.stubGlobal('fetch', network);
    const { container } = renderWithClient(<RichTextView value={`![](${src})`} />);
    expect(await screen.findByText('Картинка недоступна')).toBeInTheDocument();
    // Без адреса у редактора только служебная распорка курсора, она ничего не запрашивает.
    expect(container.querySelector('img[src]')).toBeNull();
    expect(fake.calls('storage')).toEqual([]);
    expect(network).not.toHaveBeenCalled();
  });
});

/** Окно создания держит текст у себя, поэтому редактор получает обратно то, что отдал. */
function Controlled({ onChange, ...props }: Omit<RichTextEditorProps, 'value' | 'ariaLabel'>) {
  const [value, setValue] = useState('');
  return (
    <RichTextEditor
      {...props}
      ariaLabel="Описание"
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
    />
  );
}

function openEditor(props: Partial<RichTextEditorProps> = {}) {
  const onSave = vi.fn<(markdown: string) => Promise<unknown>>(async () => undefined);
  const view = renderWithClient(<RichTextEditor ariaLabel="Описание" placeholder="Добавьте описание" value="Бетон" onSave={onSave} {...props} />);
  const rerender = (next: Partial<RichTextEditorProps>) =>
    view.rerender(
      <Suspense fallback={null}>
        <RichTextEditor ariaLabel="Описание" placeholder="Добавьте описание" value="Бетон" onSave={onSave} {...props} {...next} />
      </Suspense>,
    );
  return { ...view, onSave, rerender };
}

const field = () => screen.getByRole('textbox', { name: 'Описание' });
/** Настоящий редактор поля: набор в jsdom не проходит, правим его командами, как это делает пользователь. */
const liveEditor = () => (field() as unknown as { editor: Editor }).editor;
const edit = (text: string) => act(() => void liveEditor().commands.insertContent(text));
const leave = () => fireEvent.focusOut(field(), { relatedTarget: document.body });
const pngFile = () => new File(['x'], 'a.png', { type: 'image/png' });
const fileInput = () => screen.getByLabelText('Файл картинки');

describe('сохранение при уходе', () => {
  it('открыть и выйти без правки: onSave не вызван, даже если разбор меняет строку', async () => {
    // Разбор превратит перенос в «  \n»: строки разные, а правки не было.
    const { onSave } = openEditor({ value: 'Первое\nВторое' });
    await userEvent.click(field());
    leave();
    expect(onSave).not.toHaveBeenCalled();
  });

  it.each([
    ['со списком на конце: хвостовой абзац не добавляется', '- кирпич'],
    ['с заголовком на конце', '## Этап'],
    ['с картинкой', `![](${PATH})`],
    ['пустое', ''],
  ])('открыть и выйти без правки: описание %s', async (_name, value) => {
    const { onSave } = openEditor({ value });
    await userEvent.click(field());
    leave();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('правка уходит одним вызовом и новым Markdown', () => {
    const { onSave } = openEditor();
    edit('Ещё ');
    leave();
    expect(onSave).toHaveBeenCalledExactlyOnceWith('Ещё Бетон');
  });

  it('правку отменили: сохранять нечего', () => {
    const { onSave } = openEditor();
    edit('Ещё ');
    act(() => void liveEditor().commands.undo());
    leave();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('переход на панель уходом не считается, уход с панели наружу считается', () => {
    const { onSave } = openEditor();
    edit('Ещё ');
    const bold = screen.getByRole('button', { name: 'Жирный' });
    fireEvent.focusOut(field(), { relatedTarget: bold });
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.focusOut(bold, { relatedTarget: document.body });
    expect(onSave).toHaveBeenCalledOnce();
  });

  it('пока сохранение идёт, повторный уход не шлёт то же самое', async () => {
    let finish = () => {};
    const onSave = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    openEditor({ onSave });
    edit('Ещё ');
    leave();
    leave();
    expect(onSave).toHaveBeenCalledOnce();
    await act(async () => finish());
  });

  it('отказ базы: введённое остаётся, следующий уход повторяет сохранение', async () => {
    const onSave = vi.fn(async () => undefined);
    openEditor({ onSave });
    edit('Ещё ');
    leave();
    await act(async () => {});
    expect(field()).toHaveTextContent('Ещё Бетон');
    leave();
    expect(onSave).toHaveBeenCalledTimes(2);
  });

  it('после сохранения поле показывает данные базы и больше не считается изменённым', async () => {
    const { onSave, rerender } = openEditor();
    edit('Ещё ');
    leave();
    await act(async () => {});
    rerender({ value: 'Ещё Бетон' });
    leave();
    expect(onSave).toHaveBeenCalledOnce();

    rerender({ value: 'Чужая правка' });
    await waitFor(() => expect(field()).toHaveTextContent('Чужая правка'));
    leave();
    expect(onSave).toHaveBeenCalledOnce();
  });

  it('фоновое обновление не затирает начатый ввод, а при уходе ввод сохраняется', async () => {
    const { onSave, rerender } = openEditor();
    edit('Ещё ');
    rerender({ value: 'Чужая правка' });
    await act(async () => {});
    expect(field()).toHaveTextContent('Ещё Бетон');
    leave();
    expect(onSave).toHaveBeenCalledExactlyOnceWith('Ещё Бетон');
  });

  it('фоновое обновление с картинкой без предупреждений React', async () => {
    const warning = vi.spyOn(console, 'error');
    const { rerender } = openEditor();
    rerender({ value: `![](${PATH})` });
    await waitFor(() => expect(screen.getByRole('img')).toBeInTheDocument());
    expect(warning).not.toHaveBeenCalled();
  });

  it.each([
    ['ровно предел', 5000, true],
    ['на знак больше', 5001, false],
  ])('%s: длина %i', (_name, length, sent) => {
    const { onSave } = openEditor({ value: '' });
    edit('я'.repeat(length));
    leave();
    expect(onSave).toHaveBeenCalledTimes(sent ? 1 : 0);
    expect(field().textContent).toHaveLength(length);
    if (sent) expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    else expect(screen.getByRole('alert')).toHaveTextContent('Описание длиннее 5000 знаков (сейчас 5001)');
  });
});

describe('панель', () => {
  it.each(['Жирный', 'Курсив', 'Заголовок', 'Маркированный список', 'Нумерованный список'])('%s: кнопка показывает состояние', async (name) => {
    openEditor();
    const button = screen.getByRole('button', { name });
    expect(button).toHaveAttribute('type', 'button');
    expect(button).toHaveAttribute('aria-pressed', 'false');
    act(() => void liveEditor().commands.selectAll());
    await userEvent.click(button);
    await waitFor(() => expect(button).toHaveAttribute('aria-pressed', 'true'));
  });

  it('нажатие на панель не забирает фокус', () => {
    openEditor();
    // false: обработчик отменил действие браузера по умолчанию.
    expect(fireEvent.mouseDown(screen.getByRole('button', { name: 'Жирный' }))).toBe(false);
    expect(fireEvent.mouseDown(screen.getByRole('button', { name: 'Добавить картинку' }))).toBe(false);
  });

  it('кнопки только из брифа, отмена и повтор на клавиатуре', async () => {
    const { onSave } = openEditor();
    expect(screen.getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual(['Жирный', 'Курсив', 'Заголовок', 'Маркированный список', 'Нумерованный список', 'Добавить картинку']);
    edit('Ещё ');
    act(() => void liveEditor().commands.undo());
    expect(field()).toHaveTextContent(/^Бетон$/);
    act(() => void liveEditor().commands.redo());
    expect(field()).toHaveTextContent('Ещё Бетон');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('пустое поле показывает подсказку и подписано для скринридера', () => {
    openEditor({ value: '' });
    expect(field().querySelector('[data-placeholder="Добавьте описание"]')).not.toBeNull();
    expect(field()).toHaveAttribute('aria-multiline', 'true');
  });
});

describe('картинка в редакторе', () => {
  it('кнопка: загрузка видна, затем путь в Markdown и onChange', async () => {
    const onChange = vi.fn();
    const onUploadingChange = vi.fn();
    renderWithClient(<Controlled onChange={onChange} onUploadingChange={onUploadingChange} />);
    fireEvent.change(fileInput(), { target: { files: [pngFile()] } });
    expect(screen.getByRole('status')).toHaveTextContent('Загружаем картинку…');
    expect(onUploadingChange).toHaveBeenLastCalledWith(true);

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(onChange.mock.lastCall?.[0]).toMatch(new RegExp(`^!\\[\\]\\(${USER}/[0-9a-f-]{36}\\.png\\)$`));
    expect(onUploadingChange).toHaveBeenLastCalledWith(false);
    expect(fake.calls('storage')[0]?.method).toBe('upload');
  });

  it.each([
    ['тип', new File(['x'], 'a.gif', { type: 'image/gif' }), 'только картинку JPG, PNG или WebP'],
    ['размер', Object.defineProperty(pngFile(), 'size', { value: 5 * 1024 * 1024 + 1 }), 'Картинка больше 5 МБ'],
  ])('не тот %s: понятный текст, запроса нет, текст цел', async (_name, file, text) => {
    openEditor();
    edit('Ещё ');
    fireEvent.change(fileInput(), { target: { files: [file] } });
    expect(await screen.findByRole('alert')).toHaveTextContent(text);
    expect(fake.calls('storage')).toEqual([]);
    expect(field()).toHaveTextContent('Ещё Бетон');
  });

  it('сбой загрузки: понятный текст, текст цел, новая правка убирает ошибку', async () => {
    fake.respond('storage', { data: null, error: { message: 'no' } });
    openEditor();
    edit('Ещё ');
    fireEvent.change(fileInput(), { target: { files: [pngFile()] } });
    expect(await screen.findByRole('alert')).toHaveTextContent('Нет связи');
    expect(field()).toHaveTextContent('Ещё Бетон');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    edit('и ');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('вставка файла из буфера загружает его', async () => {
    const onChange = vi.fn();
    renderWithClient(<Controlled onChange={onChange} />);
    fireEvent.paste(field(), { clipboardData: { files: [pngFile()], getData: () => '', types: ['Files'], items: [] } });
    await waitFor(() => expect(onChange.mock.lastCall?.[0]).toMatch(/^!\[\]\(/));
  });

  it('буфер с текстом и снимком: вставляется текст, файл не загружается', () => {
    openEditor();
    fireEvent.paste(field(), { clipboardData: { files: [pngFile()], getData: (type: string) => (type === 'text/plain' ? 'Из таблицы' : ''), types: ['text/plain', 'Files'], items: [] } });
    expect(fake.calls('storage')).toEqual([]);
  });

  it('перетаскивание файла загружает его', async () => {
    const onChange = vi.fn();
    renderWithClient(<Controlled onChange={onChange} />);
    // jsdom не считает раскладку, а без места под курсором редактор бросок не принимает.
    vi.spyOn(liveEditor().view, 'posAtCoords').mockReturnValue({ pos: 1, inside: -1 });
    fireEvent.drop(field(), { dataTransfer: { files: [pngFile()], getData: () => '', types: ['Files'] } });
    await waitFor(() => expect(onChange.mock.lastCall?.[0]).toMatch(/^!\[\]\(/));
  });

  it('из редактора ушли, пока файл грузился: картинка всё равно сохраняется', async () => {
    const { onSave } = openEditor();
    fireEvent.change(fileInput(), { target: { files: [pngFile()] } });
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave.mock.lastCall?.[0]).toMatch(/!\[\]\(.+\.png\)/);
  });

  it('картинка сохраняется сразу: закрытая вкладка не оставит файл без описания', async () => {
    const { onSave } = openEditor();
    act(() => liveEditor().view.dom.focus());
    fireEvent.change(fileInput(), { target: { files: [pngFile()] } });
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
    expect(onSave).toHaveBeenCalledOnce();
  });
});
