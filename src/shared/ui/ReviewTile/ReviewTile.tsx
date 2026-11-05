import { Link } from 'react-router';
import { delay } from '../../lib/format';
import { paths } from '../../lib/routes';
import { Crane } from '../Crane';
import { Roll } from '../Roll';

/** Чёрный блок с краном: ведёт на «Ждут проверки». hero: шапка экрана. */
export function ReviewTile({ waiting, hero = false }: { waiting: number; hero?: boolean }) {
  return (
    <Link className={hero ? 'tile t-crane hero-crane lift w' : 'tile t-crane lift w'} to={paths.review} style={delay('25ms')}>
      <Crane />
      <span className="big-n">
        <Roll value={waiting} />
      </span>
      <span className="big-l">Ждут проверки</span>
    </Link>
  );
}
