import { render } from '@testing-library/react';
import { expect, it } from 'vitest';
import { Roll } from './Roll';

it.each([
  [0, ['0']],
  [7, ['7']],
  [42, ['4', '2']],
  [100, ['1', '0', '0']],
])('цифры %i едут отдельными лентами', (value, expected) => {
  render(<Roll value={value} />);
  const shown = [...document.querySelectorAll<HTMLElement>('.dg')].map((d) => d.style.getPropertyValue('--n'));
  expect(shown).toEqual(expected);
  expect(document.querySelector('.roll')).toHaveAttribute('aria-hidden', 'true');
  expect(document.querySelector('.sr')).toHaveTextContent(String(value));
});

it('знак после числа виден и читается диктором', () => {
  render(<Roll value={85} suffix="%" />);
  expect(document.querySelector('.sr')).toHaveTextContent('85%');
  expect(document.querySelector('.roll + span')).toHaveTextContent('%');
});
