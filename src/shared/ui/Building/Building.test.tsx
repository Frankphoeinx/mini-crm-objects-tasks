import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Building, floorsOf } from './Building';

describe('floorsOf', () => {
  it('без задач три пустых этажа', () => {
    const floors = floorsOf(0, 0);
    expect(floors).toHaveLength(3);
    expect(floors.every((f) => f.ghost && !f.full)).toBe(true);
  });

  it.each([
    [1, 0, 1, 0],
    [1, 1, 1, 1],
    [5, 2, 5, 2],
    [24, 12, 24, 12],
    [25, 12, 24, 12],
    [48, 24, 24, 12],
  ])('%i задач, принято %i: этажей %i, заполнено %i', (total, accepted, floors, full) => {
    const result = floorsOf(total, accepted);
    expect(result).toHaveLength(floors);
    expect(result.filter((f) => f.full)).toHaveLength(full);
    // Заполнены нижние: первые в списке рисуются снизу.
    expect(result.slice(0, full).every((f) => f.full)).toBe(true);
  });

  it('вспышка только на верхнем заполненном этаже и без задержки', () => {
    const result = floorsOf(4, 2, true);
    expect(result.map((f) => f.flash)).toEqual([false, true, false, false]);
    expect(result.every((f) => f.delay === '0ms')).toBe(true);
  });

  it.each([
    [0, '0ms'],
    [5, '150ms'],
    [10, '150ms'],
  ])('волна снизу: этаж %i задержка %s', (i, delay) => {
    expect(floorsOf(24, 0)[i]?.delay).toBe(delay);
  });
});

describe('Building', () => {
  it('рисует этажи, крышу и леса', () => {
    render(<Building total={3} accepted={1} viewTransitionName="bld-o1" />);
    expect(document.querySelectorAll('.fl')).toHaveLength(3);
    expect(document.querySelectorAll('.fl.is-full')).toHaveLength(1);
    expect(document.querySelector('.bld')).toHaveStyle({ viewTransitionName: 'bld-o1' });
    expect(document.querySelector('.bld-roof')).toBeInTheDocument();
    expect(document.querySelector('.scaf')).toBeInTheDocument();
  });

  it('вспышка показывает галочку', () => {
    render(<Building total={2} accepted={1} flash />);
    expect(document.querySelector('.fl.is-flash .fl-ok')).toBeInTheDocument();
  });
});
