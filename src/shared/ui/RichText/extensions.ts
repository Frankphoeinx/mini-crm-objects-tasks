import { Image } from '@tiptap/extension-image';
import { Paragraph } from '@tiptap/extension-paragraph';
import { Placeholder } from '@tiptap/extensions';
import { Markdown } from '@tiptap/markdown';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import { marked, Tokenizer } from 'marked';
import { TaskImage } from './TaskImage';

// Разбираем только то, что есть на панели, всё остальное остаётся буквами. У отключённых расширений нет разбора:
// код, «---» и таблицы пропали бы из текста молча, ссылки потеряли бы адрес, а HTML стал бы элементами.
const asText = () => undefined;
marked.use({
  // Без этого старые описания склеятся: перевод строки в них значит перевод строки.
  breaks: true,
  tokenizer: {
    html: asText,
    tag: asText,
    code: asText,
    fences: asText,
    blockquote: asText,
    hr: asText,
    lheading: asText,
    def: asText,
    table: asText,
    codespan: asText,
    del: asText,
    autolink: asText,
    url: asText,
    reflink: asText,
    // Флажков нет на панели, и разбор задач ломает документ: «- [ ] текст» остаётся пунктом списка с этими буквами.
    list(src) {
      const { gfm } = this.options;
      this.options.gfm = false;
      const token = Tokenizer.prototype.list.call(this, src);
      this.options.gfm = gfm;
      return token;
    },
    // Этот же разбор обслуживает картинки: они остаются (false: разбор по умолчанию).
    link: (src) => (src.startsWith('!') ? false : undefined),
    // Размеры вроде 3*5*2 в старых описаниях: без этого пятёрка стала бы курсивом, а звёздочки пропали.
    emStrong: (src, _masked, prevChar = '') => (/\d/.test(prevChar) && /^\*+\d/.test(src) ? undefined : false),
  },
});

// Картинка в описании строчная: так любой Markdown даёт правильный документ, даже текст и картинка в одной строке.
const TaskImageNode = Image.extend({
  addNodeView: () => ReactNodeViewRenderer(TaskImage),
  // Написанное руками ![](адрес) остаётся текстом.
  addInputRules: () => [],
}).configure({ inline: true });

const ParagraphForDescription = Paragraph.extend({
  // Обычный абзац выносит одиночную картинку из себя, а строчному узлу нужен абзац вокруг.
  parseMarkdown(token, helpers) {
    const tokens = token.tokens ?? [];
    if (tokens.length === 1 && tokens[0]?.type === 'image') return helpers.createNode('paragraph', undefined, helpers.parseInline(tokens));
    return this.parent?.(token, helpers) ?? [];
  },
  // Tiptap экранирует только знаки внутри строки: набранное «# текст» или «1. текст» при следующем открытии стало бы заголовком или списком.
  renderMarkdown(node, helpers, context) {
    return (this.parent?.(node, helpers, context) ?? '').replace(/^( *)(#{1,6}(?= )|[-+](?= )|\d+(?=[.)] ))/gm, (_line, indent: string, marker: string) =>
      /\d/.test(marker) ? `${indent}${marker}\\` : `${indent}\\${marker}`,
    );
  },
});

export function richTextExtensions(placeholder = '') {
  return [
    StarterKit.configure({
      paragraph: false,
      heading: { levels: [2] },
      // Ссылок нет совсем, поэтому и автоссылки с javascript: быть не может.
      link: false,
      blockquote: false,
      code: false,
      codeBlock: false,
      horizontalRule: false,
      strike: false,
      underline: false,
      gapcursor: false,
      // Хвостовой абзац менял бы документ сам по себе: открыть и выйти считалось бы правкой.
      trailingNode: false,
    }),
    ParagraphForDescription,
    TaskImageNode,
    Markdown,
    Placeholder.configure({ placeholder }),
  ];
}
