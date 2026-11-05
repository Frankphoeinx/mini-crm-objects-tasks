import { EditorContent, useEditor } from '@tiptap/react';
import { useState } from 'react';
import { richTextExtensions } from './extensions';

function View({ value }: { value: string }) {
  const [extensions] = useState(() => richTextExtensions());
  // role: иначе Tiptap назовёт текст только для чтения полем ввода.
  const editor = useEditor({ extensions, content: value, contentType: 'markdown', editable: false, editorProps: { attributes: { class: 'rt-text', role: 'none' } } });
  return <EditorContent editor={editor} className="tk-desc rt-view" />;
}

/** Описание только для чтения. Новый текст: новый показ, состояния у него нет. */
export default function RichTextView({ value }: { value: string }) {
  return <View key={value} value={value} />;
}
