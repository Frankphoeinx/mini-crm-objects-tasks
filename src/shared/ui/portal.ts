export const PORTAL_ROOT_ID = 'bs-root';

/** Окна и списки рисуются в корне .bs: их не обрезают плитки и доска, а переменные темы остаются доступны. */
export function portalRoot() {
  return document.getElementById(PORTAL_ROOT_ID) ?? document.body;
}
