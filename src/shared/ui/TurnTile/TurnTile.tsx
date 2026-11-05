import { Link } from 'react-router';
import { delay } from '../../lib/format';
import { paths } from '../../lib/routes';
import { Roll } from '../Roll';

type TurnTileProps = {
  turn: number;
  /** Задержка волны появления. */
  d?: string;
  /** Плитка ведёт в «Мои задачи»: на списке объектов. В шапке экрана это просто число. */
  link?: boolean;
};

/** Оранжевая плитка «Ваш ход»: сколько задач ждут действия этого человека. */
export function TurnTile({ turn, d = '50ms', link = false }: TurnTileProps) {
  const number = (
    <>
      <span className="lbl">Ваш ход</span>
      <span className="turn-n">
        <Roll value={turn} />
      </span>
    </>
  );
  if (link) {
    return (
      <Link className="tile t-orange lift w" to={paths.my}>
        {number}
        <span className="o-title o-more" style={{ marginTop: 0 }}>
          Открыть мои задачи
        </span>
      </Link>
    );
  }
  return (
    <div className="tile t-orange w" style={delay(d)}>
      {number}
      <span className="lbl o-more">Ждут вашего действия</span>
    </div>
  );
}
