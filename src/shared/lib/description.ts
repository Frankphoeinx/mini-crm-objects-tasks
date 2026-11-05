/** Предел базы для описания задачи. Считаются все знаки Markdown, а не только видимый текст. */
export const DESCRIPTION_MAX = 5000;

const ENTITIES: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"' };

// Звёздочка между цифрами не разметка (см. extensions.ts). У подчёркивания правило CommonMark: внутри слова не считается.
const STARS = /(?<![\\*])(?!(?<=\d)\*+\d)(\*{1,3})(?=[^\s*])(.+?)(?<=[^\s\\*])\1/g;
const UNDERSCORES = /(?<![\\_\p{L}\p{N}])(_{1,3})(?=[^\s_])(.+?)(?<=[^\s\\_])\1(?![_\p{L}\p{N}])/gu;

/**
 * Описание без значков Markdown, картинка словом: для истории и запасного вида до загрузки редактора.
 * shortcut: простые замены вместо разборщика, чтобы он не попал в основной файл; ссылки на числовые символы (&#38;) остаются как есть.
 */
export function plainText(markdown: string): string {
  return markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '[картинка]')
    .replace(/^&nbsp;$/gm, '')
    .replace(/ {2,}$/gm, '')
    .replace(/^ {0,3}#{1,6}[ \t]+/gm, '')
    .replace(/^[ \t]*[-*+][ \t]+/gm, '')
    .replace(STARS, '$2')
    .replace(STARS, '$2')
    .replace(UNDERSCORES, '$2')
    .replace(/\\([!-/:-@[-`{-~])/g, '$1')
    .replace(/&(lt|gt|amp|quot);/g, (_match, name: string) => ENTITIES[name] ?? '');
}
