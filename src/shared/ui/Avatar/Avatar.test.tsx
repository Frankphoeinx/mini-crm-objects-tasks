import { render } from '@testing-library/react';
import { expect, it } from 'vitest';
import { manager, worker } from '../../test';
import { Avatar } from './Avatar';

it.each([
  [manager, 'ava-anna', 'АС'],
  [worker, 'ava-petr', 'ПИ'],
])('человек: %o', (person, cls, initials) => {
  const { container } = render(<Avatar person={person} />);
  expect(container.firstChild).toHaveClass('ava-s', cls);
  expect(container.firstChild).toHaveTextContent(initials);
});

it('не назначен: пунктирная без букв', () => {
  const { container } = render(<Avatar />);
  expect(container.firstChild).toHaveClass('is-none');
  expect(container.firstChild).toHaveTextContent('');
});

it('объект: значок', () => {
  const { container } = render(<Avatar place />);
  expect(container.querySelector('.ic')).toBeInTheDocument();
});
