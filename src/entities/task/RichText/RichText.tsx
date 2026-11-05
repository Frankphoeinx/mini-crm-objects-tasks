import { lazy, Suspense } from 'react';
import { plainText } from '@/shared/lib';

// Редактор тяжёлый и нужен только на карточке и в окне создания: в основной файл сборки он не попадает.
const LazyEditor = lazy(() => import('./RichTextEditor'));
const LazyView = lazy(() => import('./RichTextView'));

export type RichTextEditorProps = {
  /** Markdown из базы или состояния окна. */
  value: string;
  /** Каждая правка, для окна создания. */
  onChange?: (markdown: string) => void;
  /** Уход из редактора после настоящей правки. Промис завершается, когда данные экрана уже свежие, и не падает. */
  onSave?: (markdown: string) => Promise<unknown>;
  /** Идёт загрузка картинки: окну создания пока нельзя сохраняться, иначе картинка потеряется. */
  onUploadingChange?: (uploading: boolean) => void;
  ariaLabel: string;
  placeholder?: string;
};

function Fallback({ value }: { value: string }) {
  return <p className="tk-desc rt-plain">{plainText(value)}</p>;
}

/** Та же рамка и панель, что у редактора: при первой загрузке раскладка не прыгает. */
function EditorFallback({ value }: { value: string }) {
  return (
    <div className="rt">
      <div className="rt-bar rt-bar-wait" aria-hidden="true"></div>
      <p className="rt-field rt-plain">{plainText(value)}</p>
    </div>
  );
}

export function RichTextEditor(props: RichTextEditorProps) {
  return (
    <Suspense fallback={<EditorFallback value={props.value} />}>
      <LazyEditor {...props} />
    </Suspense>
  );
}

export function RichTextView({ value }: { value: string }) {
  return (
    <Suspense fallback={<Fallback value={value} />}>
      <LazyView value={value} />
    </Suspense>
  );
}
