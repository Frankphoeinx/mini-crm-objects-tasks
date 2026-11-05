// Заглушка каркаса: WP-3 заменит файл целиком, имя и пропсы менять нельзя.
import type { ReactNode } from 'react';

/** Страница объекта: шапка от WP-3, доска приходит в board от src/app. key={objectId} ставит роутер. */
export function ObjectPage({ objectId, board }: { objectId: string; board: ReactNode }) {
  return (
    <>
      <div className="tile empty w">
        <h1 className="h1">Объект</h1>
        <p>Экран объекта {objectId} появится на следующем шаге.</p>
      </div>
      {board}
    </>
  );
}
