// Заглушка каркаса: WP-4 заменит файл целиком, имя и пропсы менять нельзя.

export function TaskPage({ taskId }: { taskId: string }) {
  return (
    <div className="tile empty w">
      <h1 className="h1">Задача</h1>
      <p>Задача {taskId} появится на следующем шаге.</p>
    </div>
  );
}
