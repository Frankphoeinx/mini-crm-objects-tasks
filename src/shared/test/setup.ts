import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

afterEach(cleanup);

// jsdom не умеет прокрутку окна, её вызывает ScrollRestoration.
vi.stubGlobal('scrollTo', () => {});

// jsdom не считает раскладку и не создаёт адреса файлов, а настоящий редактор и картинки описания ими пользуются.
const noRects = () => [] as unknown as DOMRectList;
Range.prototype.getClientRects = noRects;
Range.prototype.getBoundingClientRect = () => new DOMRect();
Element.prototype.getClientRects = noRects;
document.elementFromPoint = () => null;
URL.createObjectURL = () => 'blob:test-image';
