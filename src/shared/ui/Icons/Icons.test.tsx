import { render } from '@testing-library/react';
import { expect, it } from 'vitest';
import { Icon, IconDefs, type IconName } from './Icons';

const NAMES: IconName[] = ['new', 'work', 'review', 'rework', 'accepted', 'crane', 'pin', 'plus', 'back', 'pen', 'trash', 'down', 'cal', 'dial'];

it.each(NAMES)('значок %s есть в заготовках', (name) => {
  render(
    <>
      <IconDefs />
      <Icon name={name} />
    </>,
  );
  expect(document.getElementById(`i-${name}`)).toBeInTheDocument();
  expect(document.querySelector(`use[href="#i-${name}"]`)?.closest('svg')).toHaveAttribute('aria-hidden', 'true');
});

it.each(['crane-mast', 'crane-jib', 'crane-trolley', 'crane-cable', 'crane-block', 'crane-sling', 'crane-plate', 'crane-bld', 'scaf', 'bricks'])(
  'заготовка рисунка %s есть',
  (id) => {
    render(<IconDefs />);
    expect(document.getElementById(id)).toBeInTheDocument();
  },
);

it('дополнительный класс', () => {
  render(<Icon name="crane" className="ic-xl" />);
  expect(document.querySelector('svg')).toHaveClass('ic', 'ic-xl');
});
