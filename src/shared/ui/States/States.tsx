import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { userMessage } from '../../api/errors';
import { Icon, type IconName } from '../Icons';

// Состояния экрана собраны из плитки .empty эталона: новых стилей нет.

export function EmptyState({ icon, title, text, action }: { icon: IconName; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="tile empty w">
      <Icon name={icon} className="ic-xl" />
      <h2 className="tile-h">{title}</h2>
      <p>{text}</p>
      {action}
    </div>
  );
}

export function LoadingState({ text = 'Загружаем…' }: { text?: string }) {
  return (
    <div className="tile empty w" role="status">
      <Icon name="crane" className="ic-xl" />
      <p>{text}</p>
    </div>
  );
}

export function ErrorState({ error, onRetry, title = 'Не получилось загрузить' }: { error: unknown; onRetry?: () => void; title?: string }) {
  return (
    <div className="tile empty w" role="alert">
      <Icon name="rework" className="ic-xl" />
      <h2 className="tile-h">{title}</h2>
      <p>{userMessage(error)}</p>
      {onRetry && (
        <button className="btn is-primary" type="button" onClick={onRetry}>
          Повторить
        </button>
      )}
    </div>
  );
}

/** Запись не найдена или скрыта правами: база эти случаи не различает, и показывать разницу нельзя. */
export function NotFoundState({ title = 'Здесь ничего нет', text = 'Страница не найдена или у вас нет к ней доступа.', action }: { title?: string; text?: string; action?: ReactNode }) {
  return <EmptyState icon="pin" title={title} text={text} action={action} />;
}

type QueryStateProps<T> = {
  query: Pick<UseQueryResult<T | null>, 'data' | 'isPending' | 'error' | 'refetch'>;
  /** Что показать, если запись не найдена. */
  notFound?: ReactNode;
  children: (data: T) => ReactNode;
};

/** Загрузка, ошибка с повтором, не найдено, данные. Ошибка фонового обновления не прячет уже показанные данные. */
export function QueryState<T>({ query, notFound, children }: QueryStateProps<T>) {
  if (query.data === undefined) {
    if (query.error) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
    return <LoadingState />;
  }
  if (query.data === null) return notFound ?? <NotFoundState />;
  return children(query.data);
}
