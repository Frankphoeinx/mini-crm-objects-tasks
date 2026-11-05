import { useLayoutEffect, useRef } from 'react';

const EASE_OUT = 'cubic-bezier(.16,1,.3,1)';

// Перенос: быстрый подъём с тенью, мягкая посадка; тень гасит .kcard.is-landed::before.
function liftCard(el: HTMLElement, dx: number, dy: number) {
  el.animate(
    [
      { transform: `translate(${dx}px,${dy}px)` },
      { transform: `translate(${dx * 0.62}px,${dy * 0.62 - 14}px) rotate(-1.2deg) scale(1.03)`, offset: 0.26 },
      { transform: 'none' },
    ],
    { duration: 340, easing: EASE_OUT },
  );
}

function slideCard(el: HTMLElement, dx: number, dy: number) {
  el.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.2,.8,.2,1)' });
}

type Spot = { x: number; y: number; parent: Element | null };

// Смещения, а не getBoundingClientRect: замер идёт на каждый рендер, и его не должны сбивать прокрутка, наведение, волна и незавершённый перенос.
function spotOf(card: HTMLElement): Spot {
  const col = card.closest<HTMLElement>('.col');
  return { x: card.offsetLeft + (col?.offsetLeft ?? 0), y: card.offsetTop + (col?.offsetTop ?? 0), parent: card.parentElement };
}

/**
 * Плавный перенос: карточки помнят, где стояли, и после обновления едут на новое место.
 * Смена статуса приходит и из очереди отмены, и из фоновой загрузки, поэтому прежние места запоминаются после каждого рендера, а не перед действием.
 * layoutKey меняется, когда меняется состав колонок: иначе после смены размера окна поехала бы вся доска.
 */
export function useCardFlip(layoutKey: string) {
  const boardRef = useRef<HTMLElement>(null);
  const spots = useRef(new Map<string, Spot>());
  const lastKey = useRef(layoutKey);

  useLayoutEffect(() => {
    const before = spots.current;
    const cards = [...(boardRef.current?.querySelectorAll<HTMLElement>('[data-card]') ?? [])];
    const now = new Map(cards.map((el) => [el.dataset.card ?? '', spotOf(el)]));
    spots.current = now;
    if (lastKey.current === layoutKey) return;
    lastKey.current = layoutKey;

    const shifted = cards.flatMap((el) => {
      const was = before.get(el.dataset.card ?? '');
      const is = now.get(el.dataset.card ?? '');
      if (!was || !is || (was.x === is.x && was.y === is.y)) return [];
      return [{ el, dx: was.x - is.x, dy: was.y - is.y, moved: was.parent !== is.parent }];
    });
    if (!shifted.length || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    for (const { el, dx, dy, moved } of shifted) (moved ? liftCard : slideCard)(el, dx, dy);
  });

  return boardRef;
}
