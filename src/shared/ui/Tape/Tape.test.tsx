import { render } from '@testing-library/react';
import { expect, it } from 'vitest';
import { Tape } from './Tape';

it.each([
  [0, '0'],
  [0.5, '0.5'],
  [1, '1'],
])('лента выезжает на долю %f', (value, expected) => {
  render(<Tape value={value} />);
  const tape = document.querySelector<HTMLElement>('.tape');
  expect(tape?.style.getPropertyValue('--p')).toBe(expected);
  expect(tape).toHaveClass('is-sm');
  expect(tape).toHaveAttribute('aria-hidden', 'true');
});

it('большая рулетка', () => {
  render(<Tape value={1} small={false} />);
  expect(document.querySelector('.tape')).not.toHaveClass('is-sm');
});
