// Заглушка каркаса: WP-4 заменит файл целиком, имя и пропсы менять нельзя.

export function ObjectBoard({ objectId }: { objectId: string }) {
  return (
    <div className="tile empty w">
      <h1 className="h1">Доска</h1>
      <p>Доска объекта {objectId} появится на следующем шаге.</p>
    </div>
  );
}
