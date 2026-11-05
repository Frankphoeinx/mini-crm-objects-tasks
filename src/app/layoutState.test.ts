import { describe, expect, it } from 'vitest';
import { activeTab, isWidePage } from './layoutState';

describe('activeTab', () => {
  it.each([
    ['/objects', null, 'objects'],
    ['/objects/1', null, 'objects'],
    ['/review', null, 'objects'],
    ['/my', null, 'my'],
    ['/tasks/1', null, 'objects'],
    ['/tasks/1', { from: 'object' }, 'objects'],
    ['/tasks/1', { from: 'review' }, 'objects'],
    ['/tasks/1', { from: 'my' }, 'my'],
    ['/неизвестно', null, 'objects'],
  ])('%s, %o', (pathname, state, expected) => {
    expect(activeTab(pathname, state)).toBe(expected);
  });
});

describe('isWidePage: доска занимает всё окно', () => {
  it.each([
    ['/objects', false],
    ['/objects/1', true],
    ['/my', true],
    ['/review', true],
    ['/tasks/1', false],
  ])('%s', (pathname, expected) => {
    expect(isWidePage(pathname)).toBe(expected);
  });
});
