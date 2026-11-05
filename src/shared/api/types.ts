// Типы таблиц. Клиент не может передать status, author_id, created_by, deleted_at: их нет в Insert и Update.

export type Role = 'manager' | 'worker';
export type TaskStatus = 'new' | 'work' | 'review' | 'rework' | 'accepted';
export type EventKind = 'created' | 'status' | 'edit' | 'deleted';
export type EditField = 'title' | 'description' | 'object' | 'assignee';

export type Profile = {
  id: string;
  full_name: string;
  role: Role;
};

export type ObjectRow = {
  id: string;
  name: string;
  address: string;
  created_by: string;
  created_at: string;
  deleted_at: string | null;
};

export type Task = {
  id: string;
  object_id: string;
  title: string;
  description: string;
  assignee_id: string | null;
  status: TaskStatus;
  author_id: string;
  created_at: string;
  deleted_at: string | null;
  /** Растёт от правки названия и описания: по нему видно, что текст успел изменить другой постановщик. */
  text_version: number;
};

/** Строка вида task_board: задача плюс сведения о возвратах. Считать второй круг отдельным запросом не нужно. */
export type BoardTask = Task & {
  return_count: number;
  last_return_comment: string | null;
  last_return_by: string | null;
  last_return_at: string | null;
};

export type TaskEvent = {
  id: number;
  task_id: string;
  kind: EventKind;
  actor_id: string;
  from_status: TaskStatus | null;
  to_status: TaskStatus | null;
  comment: string | null;
  field: EditField | null;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
};

export type NewObject = { name: string; address: string };
export type NewTask = {
  object_id: string;
  title: string;
  description: string;
  assignee_id: string | null;
};
export type TaskPatch = Partial<NewTask>;

export type Database = {
  public: {
    Tables: {
      profiles: { Row: Profile; Insert: never; Update: never; Relationships: [] };
      objects: { Row: ObjectRow; Insert: NewObject; Update: Partial<NewObject>; Relationships: [] };
      tasks: { Row: Task; Insert: NewTask; Update: TaskPatch; Relationships: [] };
      task_events: { Row: TaskEvent; Insert: never; Update: never; Relationships: [] };
    };
    Views: {
      task_board: { Row: BoardTask; Relationships: [] };
    };
    Functions: {
      change_task_status: {
        Args: { p_task_id: string; p_to: TaskStatus; p_comment?: string | null };
        Returns: Task;
      };
      delete_task: { Args: { p_task_id: string }; Returns: undefined };
      delete_object: { Args: { p_object_id: string }; Returns: undefined };
    };
    Enums: { task_status: TaskStatus };
    CompositeTypes: Record<string, never>;
  };
};
