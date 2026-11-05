import { useEffect, useState, type ComponentType } from 'react';
import { plainText } from '@/shared/lib';

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

type Part<P> = { component: ComponentType<P> | null; failed: boolean; ready: Promise<void> };

/**
 * Редактор тяжёлый, поэтому лежит в отдельном файле и загружается сразу после старта сайта.
 * lazy и Suspense здесь нельзя: появление содержимого из Suspense запускает анимацию смены экрана (ViewTransition в AppLayout), и вся страница мигала при первом открытии окна.
 */
function loadPart<P>(load: () => Promise<{ default: ComponentType<P> }>): Part<P> {
  const part: Part<P> = { component: null, failed: false, ready: Promise.resolve() };
  part.ready = load().then(
    (module) => {
      part.component = module.default;
    },
    () => {
      part.failed = true;
    },
  );
  return part;
}

const editorPart = loadPart<RichTextEditorProps>(() => import('./RichTextEditor'));
const viewPart = loadPart<{ value: string }>(() => import('./RichTextView'));

/** Перерисовать, когда файл загрузится: обычное обновление, анимацию смены экрана оно не запускает. */
function useLoaded(part: Part<never>) {
  const [, setLoaded] = useState(false);
  useEffect(() => {
    if (!part.component && !part.failed) void part.ready.then(() => setLoaded(true));
  }, [part]);
}

function Fallback({ value }: { value: string }) {
  return <p className="tk-desc rt-plain">{plainText(value)}</p>;
}

/** Та же рамка и панель, что у редактора: раскладка не прыгает. */
function EditorFallback({ value, failed }: { value: string; failed: boolean }) {
  return (
    <div className="rt">
      <div className="rt-bar rt-bar-wait" aria-hidden="true"></div>
      <p className="rt-field rt-plain">{plainText(value)}</p>
      {failed && (
        <p className="err rt-note" role="alert">
          Редактор не загрузился. Обновите страницу.
        </p>
      )}
    </div>
  );
}

export function RichTextEditor(props: RichTextEditorProps) {
  useLoaded(editorPart as Part<never>);
  const Editor = editorPart.component;
  return Editor ? <Editor {...props} /> : <EditorFallback value={props.value} failed={editorPart.failed} />;
}

export function RichTextView({ value }: { value: string }) {
  useLoaded(viewPart as Part<never>);
  const View = viewPart.component;
  return View ? <View value={value} /> : <Fallback value={value} />;
}
