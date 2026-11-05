import { EditorContent, useEditor, useEditorState, type ChainedCommands, type Editor } from '@tiptap/react';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { userMessage } from '@/shared/api';
import { useMe } from '@/shared/api';
import { TASK_IMAGE_TYPES, uploadTaskImage } from '@/shared/api';
import { DESCRIPTION_MAX } from '@/shared/lib';
import { useLeaveGuard } from '@/shared/lib';
import { Icon, type IconName } from '@/shared/ui';
import { richTextExtensions } from './extensions';
import type { RichTextEditorProps } from './RichText';

const FORMATS: { name: string; label: string; icon: IconName; toggle: (chain: ChainedCommands) => ChainedCommands }[] = [
  { name: 'bold', label: 'Жирный', icon: 'bold', toggle: (chain) => chain.toggleBold() },
  { name: 'italic', label: 'Курсив', icon: 'italic', toggle: (chain) => chain.toggleItalic() },
  { name: 'heading', label: 'Заголовок', icon: 'heading', toggle: (chain) => chain.toggleHeading({ level: 2 }) },
  { name: 'bulletList', label: 'Маркированный список', icon: 'list', toggle: (chain) => chain.toggleBulletList() },
  { name: 'orderedList', label: 'Нумерованный список', icon: 'numbered', toggle: (chain) => chain.toggleOrderedList() },
];

const read = (editor: Editor) => editor.getMarkdown().trim();

/** Редактор описания: панель, картинки, сохранение при уходе. Поведение как у EditLine, но введённое при отказе остаётся. */
export default function RichTextEditor({ value, onChange, onSave, onUploadingChange, ariaLabel, placeholder }: RichTextEditorProps) {
  const me = useMe();
  const fileRef = useRef<HTMLInputElement>(null);
  const [extensions] = useState(() => richTextExtensions(placeholder));
  const [uploadError, setUploadError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [length, setLength] = useState(0);
  const pendingUploads = useRef(0);

  // Сравниваем текст редактора с ним самим при открытии: разбор Markdown может отличаться от исходной строки.
  // null: поверх начатой правки пришло чужое обновление, при уходе правка сохраняется.
  const saved = useRef<string | null>(null);
  const sending = useRef<string | null>(null);
  const loaded = useRef<string | null>(null);

  const editor = useEditor({
    extensions,
    content: value,
    contentType: 'markdown',
    editorProps: {
      attributes: { class: 'rt-text rt-field', role: 'textbox', 'aria-multiline': 'true', 'aria-label': ariaLabel },
      handlePaste: (_view, event) => {
        // Word и Excel кладут в буфер текст вместе с его снимком: нужен текст.
        const files = [...(event.clipboardData?.files ?? [])];
        if (!files.length || event.clipboardData?.getData('text/plain').trim()) return false;
        void addFiles(files);
        return true;
      },
      handleDrop: (view, event, _slice, moved) => {
        const files = [...(event.dataTransfer?.files ?? [])];
        if (moved || !files.length) return false;
        const at = view.posAtCoords({ left: event.clientX, top: event.clientY });
        if (at) editor.commands.setTextSelection(at.pos);
        void addFiles(files);
        return true;
      },
    },
    onUpdate: ({ editor: changed }) => {
      setUploadError('');
      const markdown = read(changed);
      setLength(markdown.length);
      onChange?.(markdown);
    },
  });

  const active = useEditorState({
    editor,
    selector: ({ editor: current }) => FORMATS.filter((format) => current.isActive(format.name)).map((format) => format.name),
  });

  useEffect(() => {
    if (loaded.current === null) {
      loaded.current = value;
      saved.current = read(editor);
      return;
    }
    if (value === loaded.current) return;
    loaded.current = value;
    const current = read(editor);
    if (current === value) saved.current = value;
    else if (current !== saved.current) saved.current = null;
    else {
      // В микрозадаче: узел картинки рисуется через flushSync, внутри эффекта React этого не разрешает.
      queueMicrotask(() => {
        if (editor.isDestroyed) return;
        editor.chain().setMeta('addToHistory', false).setContent(value, { contentType: 'markdown', emitUpdate: false }).run();
        saved.current = read(editor);
      });
    }
  }, [editor, value]);

  function save() {
    const markdown = read(editor);
    if (!onSave || markdown === saved.current || markdown === sending.current || markdown.length > DESCRIPTION_MAX) return;
    sending.current = markdown;
    void onSave(markdown).finally(() => {
      if (sending.current === markdown) sending.current = null;
    });
  }

  function trackUpload(change: number) {
    pendingUploads.current += change;
    const active = pendingUploads.current > 0;
    setUploading(active);
    onUploadingChange?.(active);
  }

  // shortcut: картинка встаёт туда, где курсор к концу загрузки, а не туда, где он был в начале; для одной картинки хватает.
  async function addFiles(files: File[]) {
    setUploadError('');
    trackUpload(files.length);
    for (const file of files) {
      try {
        const src = await uploadTaskImage(file, me.id);
        if (editor.isDestroyed) return;
        editor.commands.insertContent({ type: 'image', attrs: { src } });
      } catch (error) {
        setUploadError(userMessage(error));
      } finally {
        trackUpload(-1);
      }
    }
    // Картинка не ждёт ухода из поля: закрытая вкладка не должна оставить файл без описания. Одно сохранение на все файлы.
    if (!editor.isDestroyed) save();
  }

  useLeaveGuard(() => !editor.isDestroyed && read(editor) !== (onSave ? saved.current : ''));
  // Переход браузерной кнопкой «назад» снимает редактор без события ухода из него.
  const saveOnLeave = useEffectEvent(() => save());
  useEffect(
    () => () => {
      if (!editor.isDestroyed) saveOnLeave();
    },
    [editor],
  );

  const tooLong = length > DESCRIPTION_MAX;

  return (
    <div
      className="rt"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) save();
      }}
    >
      {/* mousedown не забирает фокус: выделение остаётся, а переход на панель не считается уходом. */}
      <div className="rt-bar" role="group" aria-label="Оформление описания" onMouseDown={(e) => e.preventDefault()}>
        {FORMATS.map((format) => (
          <button
            key={format.name}
            className="ibtn"
            type="button"
            aria-label={format.label}
            title={format.label}
            aria-pressed={active.includes(format.name)}
            onClick={() => format.toggle(editor.chain().focus()).run()}
          >
            <Icon name={format.icon} />
          </button>
        ))}
        <button className="ibtn" type="button" aria-label="Добавить картинку" title="Добавить картинку" onClick={() => fileRef.current?.click()}>
          <Icon name="image" />
        </button>
        <input
          ref={fileRef}
          type="file"
          accept={TASK_IMAGE_TYPES}
          hidden
          aria-label="Файл картинки"
          onChange={(e) => {
            void addFiles([...(e.target.files ?? [])]);
            // Тот же файл после ошибки можно выбрать снова.
            e.target.value = '';
          }}
        />
      </div>
      <EditorContent editor={editor} />
      {uploading && (
        <p className="rt-note" role="status">
          Загружаем картинку…
        </p>
      )}
      {uploadError && (
        <p className="err rt-note" role="alert">
          {uploadError}
        </p>
      )}
      {tooLong && (
        <p className="err rt-note" role="alert">
          Описание длиннее {DESCRIPTION_MAX} знаков (сейчас {length}) и не сохранится. Сократите его.
        </p>
      )}
    </div>
  );
}
