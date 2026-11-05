import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Crane } from './Crane';

const has = (selector: string) => document.querySelector(selector) !== null;

describe('Crane', () => {
  it.each(['.job', '.job-sway', '.job-cable', '.job-block', '.job-sling', '.job-load', '.job-beacon', '.hook'])(
    'механизм цикла на месте: %s',
    (selector) => {
      render(<Crane />);
      expect(has(selector)).toBe(true);
    },
  );

  it('без здания: только кран', () => {
    render(<Crane />);
    expect(has('.lg-bld')).toBe(false);
    expect(has('.job-placed')).toBe(false);
  });

  it('вариант входа: кран строит здание, огоньки окон и уложенная плита', () => {
    render(<Crane withBuilding />);
    expect(has('.lg-bld use[href="#crane-bld"]')).toBe(true);
    expect(document.querySelectorAll('.job-win')).toHaveLength(2);
    expect(has('.job-placed')).toBe(true);
    expect(has('.lg-jib .job-load')).toBe(true);
  });

  it('рисунок скрыт от диктора', () => {
    render(<Crane />);
    expect(document.querySelector('.art-clip')).toHaveAttribute('aria-hidden', 'true');
  });
});
