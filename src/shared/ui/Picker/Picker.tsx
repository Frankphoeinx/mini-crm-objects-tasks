import { useEffect, useEffectEvent, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import type { ObjectRow, Profile } from '../../lib/types';
import { ROLE_LABEL } from '../../lib/people';
import { Avatar } from '../Avatar';
import { Icon } from '../Icons';
import { portalRoot } from '../portal';

export type PickerOption = {
  /** Пустая строка: «Не назначен». */
  id: string;
  name: string;
  sub: string;
  /** Человек для аватарки, null: пунктирная. Не задан: значок объекта. */
  person?: Pick<Profile, 'full_name' | 'role'> | null;
};

type Rect = { top: number; bottom: number; left: number; width: number };

/** Список под кнопкой, а если снизу не хватает места, то над ней. Ширина не меньше 280, край экрана не перекрывает. */
export function placePicker(anchor: Rect, count: number, viewportWidth: number, viewportHeight: number) {
  const width = Math.max(anchor.width, 280);
  const height = count * 56 + 12;
  const fitsBelow = anchor.bottom + 6 + height <= viewportHeight;
  return {
    width,
    left: Math.max(8, Math.min(anchor.left, viewportWidth - width - 8)),
    top: fitsBelow ? anchor.bottom + 6 : Math.max(8, anchor.top - height - 6),
  };
}

/** Исполнители первыми, постановщики в конце. clearable: снять исполнителя можно только у «Новой». */
export function personOptions(profiles: Profile[], clearable: boolean): PickerOption[] {
  const people = [...profiles]
    .sort((a, b) => Number(a.role === 'manager') - Number(b.role === 'manager'))
    .map((p) => ({ id: p.id, name: p.full_name, sub: ROLE_LABEL[p.role], person: p }));
  return clearable ? [{ id: '', name: 'Не назначен', sub: 'Можно выбрать позже', person: null }, ...people] : people;
}

export function objectOptions(objects: ObjectRow[]): PickerOption[] {
  return objects.map((o) => ({ id: o.id, name: o.name, sub: o.address }));
}

type PickerProps = {
  /** Кнопка, под которой открыт список. Ей же вернётся фокус. */
  anchor: HTMLElement;
  options: PickerOption[];
  /** Текущий выбор, пустая строка: «Не назначен». */
  value: string;
  onPick: (id: string) => void;
  onClose: () => void;
};

/** Список выбора поверх экрана: закрывается кликом вне, Esc, прокруткой; стрелки ходят по пунктам. */
export function Picker({ anchor, options, value, onPick, onClose }: PickerProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const [place] = useState(() =>
    placePicker(anchor.getBoundingClientRect(), options.length, window.innerWidth, window.innerHeight),
  );

  useEffect(() => {
    const list = listRef.current;
    (list?.querySelector<HTMLElement>('.is-current') ?? list?.querySelector('button'))?.focus({ preventScroll: true });
  }, []);

  // Вести список за кнопкой незачем: прокрутка или смена размера просто закрывают его.
  const closeQuietly = useEffectEvent(() => onClose());
  // Прокручивается только то, что двигает кнопку: свой список и соседнее поле с длинным текстом её не двигают.
  const onScroll = useEffectEvent((e: Event) => {
    if (e.target instanceof Node && !e.target.contains(anchor)) return;
    closeQuietly();
  });
  // Выбранный пункт исчез вместе со списком: без этого Esc и Tab в окне перестали бы работать.
  const backToAnchor = useEffectEvent(() => {
    if (anchor.isConnected && document.activeElement === document.body) anchor.focus({ preventScroll: true });
  });
  useEffect(() => backToAnchor, []);
  useEffect(() => {
    window.addEventListener('scroll', onScroll, { capture: true });
    window.addEventListener('resize', closeQuietly);
    return () => {
      window.removeEventListener('scroll', onScroll, { capture: true });
      window.removeEventListener('resize', closeQuietly);
    };
  }, []);

  function closeToTrigger() {
    onClose();
    if (anchor.isConnected) anchor.focus({ preventScroll: true });
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    // Список может лежать внутри окна: Esc и Tab здесь не должны дойти до него.
    e.stopPropagation();
    if (e.key === 'Escape' || e.key === 'Tab') {
      e.preventDefault();
      closeToTrigger();
      return;
    }
    const items = [...e.currentTarget.querySelectorAll('button')];
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    const target =
      e.key === 'ArrowDown' ? (at + 1) % items.length
      : e.key === 'ArrowUp' ? (at - 1 + items.length) % items.length
      : e.key === 'Home' ? 0
      : e.key === 'End' ? items.length - 1
      : -1;
    if (target < 0) return;
    e.preventDefault();
    items[target]?.focus({ preventScroll: true });
  }

  return createPortal(
    <>
      <button className="picker-veil" type="button" tabIndex={-1} aria-label="Закрыть список" onClick={closeToTrigger}></button>
      <div
        className="picker"
        ref={listRef}
        role="listbox"
        aria-label="Варианты выбора"
        style={{ left: place.left, top: place.top, width: place.width }}
        onKeyDown={onKeyDown}
      >
        {options.map((option) => {
          const current = option.id === value;
          return (
            <button
              key={option.id}
              className={current ? 'pick-opt is-current' : 'pick-opt'}
              type="button"
              role="option"
              aria-selected={current}
              onClick={() => {
                onPick(option.id);
                closeToTrigger();
              }}
            >
              {option.person === undefined ? <Avatar place /> : <Avatar person={option.person} />}
              <span className="pick-t">
                <b>{option.name}</b> <small>{option.sub}</small>
              </span>
              <Icon name="accepted" className="pick-ok" />
            </button>
          );
        })}
      </div>
    </>,
    portalRoot(),
  );
}
