import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react';
import { useTaskImage } from '../../api/taskImages';

/** Картинка описания. Путь с чужим адресом до сети не доходит, файл читается только через хранилище. */
export function TaskImage({ node }: ReactNodeViewProps) {
  const image = useTaskImage(String(node.attrs.src ?? ''));
  return (
    <NodeViewWrapper as="span" className="rt-img">
      {image.data ? (
        <img src={image.data} alt={String(node.attrs.alt ?? '') || 'Картинка из описания'} draggable={false} />
      ) : image.isLoading ? (
        <span className="rt-img-note" role="status">
          Загружаем картинку…
        </span>
      ) : (
        <span className="rt-img-note">Картинка недоступна</span>
      )}
    </NodeViewWrapper>
  );
}
