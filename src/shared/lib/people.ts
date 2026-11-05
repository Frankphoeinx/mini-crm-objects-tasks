import type { Profile, Role } from '../api/types';

export const ROLE_LABEL: Record<Role, string> = { manager: 'Постановщик', worker: 'Исполнитель' };

export function initialsOf(fullName: string) {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join('');
}

export const UNASSIGNED = 'Не назначен';

/** Имя на карточках («Пётр») и в задаче («Пётр Иванов»). Нет исполнителя или списка людей: «Не назначен». */
export function shortName(profiles: Profile[] | undefined, id: string | null) {
  return profiles?.find((p) => p.id === id)?.full_name.split(/\s+/)[0] ?? UNASSIGNED;
}

export function fullName(profiles: Profile[] | undefined, id: string | null) {
  return profiles?.find((p) => p.id === id)?.full_name ?? UNASSIGNED;
}

/** Цвет аватарки из палитры. Постоянный для человека; основание 7 выбрано так, чтобы демо-исполнители совпали с эталоном. */
export function avatarClass(person: Pick<Profile, 'full_name' | 'role'>) {
  if (person.role === 'manager') return 'ava-anna';
  const sum = [...person.full_name].reduce((total, char) => total + (char.codePointAt(0) ?? 0), 0);
  return sum % 7 % 2 ? 'ava-petr' : 'ava-sergey';
}
