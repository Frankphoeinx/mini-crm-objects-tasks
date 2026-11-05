import { useLayoutEffect, useRef, useState, type ComponentProps } from 'react';

type EditLineProps = Omit<ComponentProps<'textarea'>, 'value' | 'onChange' | 'onBlur' | 'onKeyDown' | 'rows'> & {
  value: string;
  /** Сохранить текст. Промис завершается, когда данные экрана уже свежие, и не падает. false: не сохранено. */
  onSave: (text: string) => Promise<unknown>;
  /** Пустым не сохраняется: поле вернётся к прежнему тексту. */
  required?: boolean;
  /** Enter завершает правку, а не переносит строку. */
  oneLine?: boolean;
};

/** Правка на месте: поле выглядит как текст и сохраняется при уходе из него. */
export function EditLine({ value, onSave, required = false, oneLine = false, ...field }: EditLineProps) {
  // Черновик есть только после ввода: пока он есть, фоновое обновление данных текст в поле не трогает.
  const [draft, setDraft] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  const text = draft ?? value;

  // Браузеру без field-sizing (см. .edit-line в стилях) высоту поля считаем сами.
  // shortcut: при смене ширины окна высота обновится со следующей правкой, для запасного пути этого хватает.
  useLayoutEffect(() => {
    if (CSS.supports('field-sizing', 'content') || !ref.current) return;
    ref.current.style.height = 'auto';
    ref.current.style.height = `${ref.current.scrollHeight}px`;
  }, [text]);

  function finish(typed: string) {
    const next = typed.trim();
    if (next === value || (required && !next)) {
      setDraft(null);
      return;
    }
    // Текст держим до ответа базы, иначе в поле мелькнёт старое. Начатый за это время новый ввод не трогаем.
    // При отказе черновик остаётся: набранное не пропадёт и уйдёт при следующем выходе из поля.
    setDraft(next);
    void onSave(next).then((saved) => {
      if (saved !== false) setDraft((current) => (current === next ? null : current));
    });
  }

  return (
    <textarea
      {...field}
      ref={ref}
      rows={1}
      value={text}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={(e) => finish(e.target.value)}
      onKeyDown={(e) => {
        if (!oneLine || e.key !== 'Enter') return;
        e.preventDefault();
        e.currentTarget.blur();
      }}
    />
  );
}
