import type { Profile } from '../../lib/types';
import { avatarClass, initialsOf } from '../../lib/people';
import { Icon } from '../Icons';

type Person = Pick<Profile, 'full_name' | 'role'>;

/** Аватарка человека. person = null: пунктирная «не назначен». place: значок объекта. */
export function Avatar({ person = null, place = false }: { person?: Person | null; place?: boolean }) {
  if (place) {
    return (
      <span className="ava-s">
        <Icon name="pin" />
      </span>
    );
  }
  if (!person) return <span className="ava-s is-none"></span>;
  return <span className={`ava-s ${avatarClass(person)}`}>{initialsOf(person.full_name)}</span>;
}
