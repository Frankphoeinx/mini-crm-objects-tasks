import { describe, expect, it } from 'vitest';
import type { Role, TaskStatus } from './types';
import { buildBoard, canAssign, canClearAssignee, columnOf, deniedMoveText, isReturned, movesFor } from './status';

const anna = { id: 'anna', role: 'manager' as const };
const petr = { id: 'petr', role: 'worker' as const };
const sergey = { id: 'sergey', role: 'worker' as const };

describe('movesFor: какие действия показать', () => {
  it.each<[TaskStatus, string | null, { id: string; role: Role }, TaskStatus[]]>([
    // Назначенный исполнитель ведёт задачу до проверки и забирает с доработки.
    ['new', 'petr', petr, ['work']],
    ['work', 'petr', petr, ['review']],
    ['review', 'petr', petr, []],
    ['rework', 'petr', petr, ['work']],
    ['accepted', 'petr', petr, []],
    // Чужой исполнитель не делает ничего.
    ['new', 'petr', sergey, []],
    ['work', 'petr', sergey, []],
    ['review', 'petr', sergey, []],
    ['rework', 'petr', sergey, []],
    // Постановщик принимает и возвращает, чужую работу за исполнителя не двигает.
    ['new', 'petr', anna, []],
    ['work', 'petr', anna, []],
    ['review', 'petr', anna, ['accepted', 'rework']],
    ['rework', 'petr', anna, []],
    ['accepted', 'petr', anna, []],
    // Постановщик назначил себя: выполняет и принимает сам.
    ['new', 'anna', anna, ['work']],
    ['work', 'anna', anna, ['review']],
    ['review', 'anna', anna, ['accepted', 'rework']],
    ['rework', 'anna', anna, ['work']],
    // Без исполнителя задача никуда не идёт.
    ['new', null, anna, []],
    ['new', null, petr, []],
  ])('%s, исполнитель %s, смотрит %o', (status, assignee, me, expected) => {
    expect(movesFor({ status, assignee_id: assignee }, me).map((m) => m.to)).toEqual(expected);
  });

  it('только возврат требует комментарий', () => {
    const moves = movesFor({ status: 'review', assignee_id: 'petr' }, anna);
    expect(moves.map((m) => [m.to, !!m.needComment, !!m.danger])).toEqual([
      ['accepted', false, false],
      ['rework', true, true],
    ]);
  });
});

describe('назначение', () => {
  it.each<[string | null, Role, boolean]>([
    [null, 'manager', true],
    [null, 'worker', false],
    ['petr', 'manager', false],
  ])('«Назначить»: исполнитель %s, роль %s', (assignee, role, expected) => {
    expect(canAssign({ assignee_id: assignee }, { role })).toBe(expected);
  });

  it.each<[TaskStatus, boolean]>([
    ['new', true],
    ['work', false],
    ['review', false],
    ['rework', false],
    ['accepted', false],
  ])('снять исполнителя у %s', (status, expected) => {
    expect(canClearAssignee(status)).toBe(expected);
  });
});

describe('колонки доски', () => {
  it.each<[TaskStatus, Role, TaskStatus]>([
    ['new', 'manager', 'new'],
    ['work', 'manager', 'work'],
    ['review', 'manager', 'review'],
    ['rework', 'manager', 'rework'],
    ['accepted', 'manager', 'accepted'],
    ['new', 'worker', 'new'],
    ['work', 'worker', 'work'],
    ['review', 'worker', 'review'],
    ['rework', 'worker', 'new'],
    ['accepted', 'worker', 'accepted'],
  ])('%s у роли %s лежит в %s', (status, role, column) => {
    expect(columnOf(status, role)).toBe(column);
  });

  it('у постановщика пять колонок, у исполнителя четыре', () => {
    expect(buildBoard([], 'manager').map((c) => c.key)).toEqual(['new', 'work', 'review', 'rework', 'accepted']);
    expect(buildBoard([], 'worker').map((c) => c.key)).toEqual(['new', 'work', 'review', 'accepted']);
  });

  it('у исполнителя доработка идёт первой в «Новой», статус не меняется', () => {
    const tasks = [
      { id: 'a', status: 'new' as const },
      { id: 'b', status: 'rework' as const },
      { id: 'c', status: 'new' as const },
    ];
    const [first] = buildBoard(tasks, 'worker');
    expect(first?.key).toBe('new');
    expect(first?.tasks.map((t) => [t.id, t.status])).toEqual([
      ['b', 'rework'],
      ['a', 'new'],
      ['c', 'new'],
    ]);
  });

  it('у постановщика доработка в своей колонке', () => {
    const board = buildBoard([{ id: 'b', status: 'rework' as const }], 'manager');
    expect(board.find((c) => c.key === 'rework')?.tasks).toHaveLength(1);
    expect(board.find((c) => c.key === 'new')?.tasks).toHaveLength(0);
  });
});

describe('второй круг', () => {
  it.each<[TaskStatus, number, boolean]>([
    ['new', 1, true],
    ['work', 1, true],
    ['review', 2, true],
    ['rework', 1, true],
    ['accepted', 1, false],
    ['new', 0, false],
    ['work', 0, false],
    ['review', 0, false],
  ])('%s, возвратов %i', (status, returnCount, expected) => {
    expect(isReturned({ status, return_count: returnCount })).toBe(expected);
  });
});

it('подсказка о запрете перечисляет разрешённые колонки', () => {
  const moves = movesFor({ status: 'review', assignee_id: 'petr' }, anna);
  expect(deniedMoveText('review', moves)).toBe('Так нельзя: из «На проверке» задача идёт только в «Принята» или «На доработке».');
});
