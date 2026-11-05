import { describe, expect, it } from 'vitest';
import { digits, formatDateTime, percent, plural, ratio, waveDelay } from './format';
import { avatarClass, fullName, initialsOf, shortName } from './people';
import { paths, readTaskFrom } from './routes';

describe('plural', () => {
  it.each([
    [0, '0 задач'],
    [1, '1 задача'],
    [2, '2 задачи'],
    [4, '4 задачи'],
    [5, '5 задач'],
    [11, '11 задач'],
    [12, '12 задач'],
    [14, '14 задач'],
    [21, '21 задача'],
    [22, '22 задачи'],
    [111, '111 задач'],
  ])('%i', (n, expected) => {
    expect(plural(n, 'задача', 'задачи', 'задач')).toBe(expected);
  });
});

it.each([
  [0, [0]],
  [7, [7]],
  [42, [4, 2]],
  [100, [1, 0, 0]],
])('digits(%i)', (n, expected) => {
  expect(digits(n)).toEqual(expected);
});

it.each([
  [0, 0, 0, 0],
  [0, 5, 0, 0],
  [1, 3, 33, 1 / 3],
  [3, 3, 100, 1],
])('percent и ratio (%i из %i)', (part, total, pct, share) => {
  expect(percent(part, total)).toBe(pct);
  expect(ratio(part, total)).toBe(share);
});

it.each([
  [0, '0ms'],
  [2, '50ms'],
  [6, '150ms'],
  [7, '150ms'],
])('waveDelay(%i)', (i, expected) => {
  expect(waveDelay(i)).toBe(expected);
});

describe('formatDateTime', () => {
  const now = new Date(2026, 10, 5, 12, 0);

  it('сегодня', () => {
    expect(formatDateTime(new Date(2026, 10, 5, 9, 5).toISOString(), now)).toBe('сегодня, 09:05');
  });

  it('другой день', () => {
    expect(formatDateTime(new Date(2026, 10, 3, 9, 10).toISOString(), now)).toBe('3 ноября, 09:10');
    expect(formatDateTime(new Date(2026, 9, 30, 18, 0).toISOString(), now)).toBe('30 октября, 18:00');
  });
});

describe('люди', () => {
  it.each([
    ['Анна Смирнова', 'АС'],
    ['Пётр', 'П'],
    ['  сергей   козлов  ', 'СК'],
    ['', ''],
  ])('инициалы %s', (name, expected) => {
    expect(initialsOf(name)).toBe(expected);
  });

  it.each([
    ['Анна Смирнова', 'manager', 'ava-anna'],
    ['Пётр Иванов', 'worker', 'ava-petr'],
    ['Сергей Козлов', 'worker', 'ava-sergey'],
  ] as const)('цвет аватарки демо-пользователя %s', (full_name, role, expected) => {
    expect(avatarClass({ full_name, role })).toBe(expected);
  });
});

describe('имя исполнителя', () => {
  const people = [{ id: 'p', full_name: 'Пётр Иванов', role: 'worker' as const }];

  it.each([
    [people, 'p', 'Пётр', 'Пётр Иванов'],
    [people, null, 'Не назначен', 'Не назначен'],
    [people, 'чужой', 'Не назначен', 'Не назначен'],
    [undefined, 'p', 'Не назначен', 'Не назначен'],
  ])('%#', (profiles, id, short, full) => {
    expect(shortName(profiles, id)).toBe(short);
    expect(fullName(profiles, id)).toBe(full);
  });
});

describe('адреса', () => {
  it('совпадают с контрактом', () => {
    expect([paths.login, paths.objects, paths.object('x'), paths.task('y'), paths.my, paths.review]).toEqual([
      '/login',
      '/objects',
      '/objects/x',
      '/tasks/y',
      '/my',
      '/review',
    ]);
  });

  it.each([
    [{ from: 'my' }, 'my'],
    [{ from: 'review' }, 'review'],
    [{ from: 'object' }, 'object'],
    [{ from: 'чужое' }, 'object'],
    [null, 'object'],
    [undefined, 'object'],
  ])('откуда открыта задача: %o', (state, expected) => {
    expect(readTaskFrom(state)).toBe(expected);
  });
});
