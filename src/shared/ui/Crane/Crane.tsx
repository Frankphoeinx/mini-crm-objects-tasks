import type { CSSProperties } from 'react';

/** Трос, крюк, стропы и плита двигаются вместе: цикл 12 с задан стилями .job-*. */
function Trolley() {
  return (
    <g className="trolley job">
      <use href="#crane-trolley"></use>
      <g className="hook">
        <g className="job-sway">
          <g className="job-cable">
            <use href="#crane-cable"></use>
          </g>
          <g className="job-block">
            <use href="#crane-block"></use>
            <g className="job-sling">
              <use href="#crane-sling"></use>
            </g>
            <g className="job-load">
              <use href="#crane-plate"></use>
            </g>
          </g>
        </g>
      </g>
    </g>
  );
}

/** Работающий кран. withBuilding: вариант экрана входа, кран строит здание. Кладётся первым в плитку .t-crane. */
export function Crane({ withBuilding = false }: { withBuilding?: boolean }) {
  return (
    <span className="art-clip" aria-hidden="true">
      <svg className="crane art" viewBox="0 0 560 320" preserveAspectRatio="xMaxYMin meet">
        {withBuilding ? (
          <>
            <g className="lg-bld">
              <use href="#crane-bld" x="26"></use>
              <rect className="cf job-win" x="249" y="288" width="20" height="18"></rect>
              <rect className="cf job-win" x="321" y="448" width="20" height="18" style={{ '--d': '-3s' } as CSSProperties}></rect>
              <g className="job-placed">
                <use href="#crane-plate" x="-55" y="40"></use>
              </g>
            </g>
            <use href="#crane-mast"></use>
            <g className="lg-jib">
              <use href="#crane-jib"></use>
              <Trolley />
              <circle className="cf job-beacon" cx="410" cy="12" r="3.5"></circle>
            </g>
          </>
        ) : (
          <>
            <use href="#crane-mast"></use>
            <use href="#crane-jib"></use>
            <Trolley />
            <circle className="cf job-beacon" cx="410" cy="12" r="3.5"></circle>
          </>
        )}
      </svg>
    </span>
  );
}
