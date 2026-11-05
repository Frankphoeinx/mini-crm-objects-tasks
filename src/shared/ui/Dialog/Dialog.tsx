import { useEffect, useEffectEvent, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { portalRoot } from '../portal';

const EXIT_MS = 120;
const FOCUSABLE = 'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href]';

type DialogProps = {
  title: string;
  /** Окно закрылось. Показ и данные решает родитель. */
  onClose: () => void;
  /** Идёт запрос: закрыть нельзя. */
  busy?: boolean;
  /** Содержимое. requestClose закрывает с анимацией, ей подключается кнопка «Отмена». */
  children: ReactNode | ((requestClose: () => void) => ReactNode);
};

/**
 * Окно поверх экрана: фокус внутри, Esc закрывает, после закрытия фокус возвращается на прежнее место.
 * Заголовок и кнопки кладёт родитель, разметка как в эталоне: h2, .row-btns.
 */
export function Dialog({ title, onClose, busy = false, children }: DialogProps) {
  const [closing, setClosing] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement;
    boxRef.current?.querySelector<HTMLElement>('input, textarea, .btn')?.focus();
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);

  const finishClosing = useEffectEvent(() => onClose());
  useEffect(() => {
    if (!closing) return;
    const timer = setTimeout(finishClosing, EXIT_MS);
    return () => clearTimeout(timer);
  }, [closing]);

  function requestClose() {
    if (!busy) setClosing(true);
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      requestClose();
      return;
    }
    if (e.key !== 'Tab' || !boxRef.current) return;
    const items = [...boxRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    const first = items[0];
    const last = items.at(-1);
    if (!first || !last) return;
    const active = document.activeElement;
    const inside = active instanceof HTMLElement && items.includes(active);
    if (!inside || (e.shiftKey ? active === first : active === last)) {
      e.preventDefault();
      (e.shiftKey ? last : first).focus();
    }
  }

  return createPortal(
    <div className={closing ? 'veil is-closing' : 'veil'} tabIndex={-1} onKeyDown={onKeyDown}>
      <div className="dialog" ref={boxRef} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
        {typeof children === 'function' ? children(requestClose) : children}
      </div>
    </div>,
    portalRoot(),
  );
}
