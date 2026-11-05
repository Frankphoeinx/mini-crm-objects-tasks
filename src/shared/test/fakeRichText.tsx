// Простое поле вместо настоящего редактора в тестах экранов: они проверяют экран, а редактор проверен в RichText.test.tsx.
// Подключение в тесте: vi.mock('@/entities/task/RichText', async () => (await import('@/shared/test/fakeRichText')).fakeRichTextModule());
import { useState } from 'react';
import type { RichTextEditorProps } from '@/entities/task/RichText';

function FakeEditor({ value, onChange, onSave, onUploadingChange, ariaLabel, placeholder }: RichTextEditorProps) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <>
      <textarea
        aria-label={ariaLabel}
        placeholder={placeholder}
        value={draft ?? value}
        onChange={(e) => {
          setDraft(e.target.value);
          onChange?.(e.target.value);
        }}
        onBlur={(e) => {
          const next = e.target.value.trim();
          if (next !== value) void onSave?.(next);
        }}
      />
      {onUploadingChange && (
        <button type="button" onClick={() => onUploadingChange(true)}>
          Начать загрузку
        </button>
      )}
    </>
  );
}

export function fakeRichTextModule() {
  return {
    RichTextEditor: FakeEditor,
    RichTextView: ({ value }: { value: string }) => (
      <p className="tk-desc" style={{ whiteSpace: 'pre-wrap' }}>
        {value}
      </p>
    ),
  };
}
