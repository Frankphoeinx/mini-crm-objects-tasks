// Сверка типов сайта с настоящей базой: разойдутся, и упадёт `npm run typecheck`. Файл database.generated.ts создаёт `npm run gen:types`.
import type { Database as Real } from './database.generated';
import type { BoardTask, Database, NewObject, NewTask, ObjectRow, Profile, Task, TaskEvent } from './types';

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Expect<T extends true> = T;
type Tables = Real['public']['Tables'];
type RealFunctions = Real['public']['Functions'];
type OurFunctions = Database['public']['Functions'];

export type Contract = [
  Expect<Same<Tables['profiles']['Row'], Profile>>,
  Expect<Same<Tables['objects']['Row'], ObjectRow>>,
  Expect<Same<Tables['tasks']['Row'], Task>>,
  Expect<Same<Tables['task_events']['Row'], TaskEvent>>,
  // В виде база считает все колонки необязательными, поэтому сверяем имена.
  Expect<Same<keyof Real['public']['Views']['task_board']['Row'], keyof BoardTask>>,
  Expect<keyof NewObject extends keyof Tables['objects']['Insert'] ? true : false>,
  Expect<keyof NewTask extends keyof Tables['tasks']['Insert'] ? true : false>,
  Expect<Same<keyof RealFunctions['change_task_status']['Args'], keyof OurFunctions['change_task_status']['Args']>>,
  Expect<Same<RealFunctions['change_task_status']['Args']['p_to'], OurFunctions['change_task_status']['Args']['p_to']>>,
  Expect<Same<RealFunctions['delete_task']['Args'], OurFunctions['delete_task']['Args']>>,
  Expect<Same<RealFunctions['delete_object']['Args'], OurFunctions['delete_object']['Args']>>,
];
