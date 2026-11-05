// Значки и заготовки рисунков эталона: один раз в корне страницы, дальше ссылки через <use>.

export type IconName =
  | 'new'
  | 'work'
  | 'review'
  | 'rework'
  | 'accepted'
  | 'crane'
  | 'pin'
  | 'plus'
  | 'back'
  | 'pen'
  | 'trash'
  | 'down'
  | 'cal'
  | 'dial';

/** Значок статуса берётся по его ключу: new кирпич, work каска, review рулетка, rework конус, accepted галочка. */
export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg className={className ? `ic ${className}` : 'ic'} viewBox="0 0 24 24" aria-hidden="true">
      <use href={`#i-${name}`}></use>
    </svg>
  );
}

export function IconDefs() {
  return (
    <svg className="defs" aria-hidden="true">
      <defs>
        <g id="i-new"><rect x="3" y="6" width="18" height="12" rx="2"></rect><path d="M3 12h18M9 6v6M15 6v6M6 12v6M12 12v6M18 12v6"></path></g>
        <g id="i-work"><path d="M3 17.5h18M5 17.5V14a7 7 0 0 1 14 0v3.5M10 7.3V12M14 7.3V12"></path></g>
        <g id="i-review"><rect x="3" y="6" width="14" height="13" rx="4"></rect><circle cx="10" cy="12.5" r="3"></circle><path d="M17 16h4v3"></path></g>
        <g id="i-rework"><path d="M10 4h4l4.5 15h-13zM3.5 19.5h17M8.3 11.5h7.4"></path></g>
        <g id="i-accepted"><path d="M5 12.5l4.5 4.5L19 7.5"></path></g>
        <g id="i-crane"><path d="M8 21V7M4.5 21h7M3 7h18M3 7l7-4M8 7l2-4 7 4M17 7v6M15 13h4l-1 3h-2z"></path></g>
        <g id="i-pin"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z"></path><circle cx="12" cy="9.5" r="2.5"></circle></g>
        <g id="i-plus"><path d="M12 5v14M5 12h14"></path></g>
        <g id="i-back"><path d="M19 12H5M11 6l-6 6 6 6"></path></g>
        <g id="i-pen"><path d="M4 20l1-4L16 5l3 3L8 19z"></path></g>
        <g id="i-trash"><path d="M4 7h16M9 7V4h6v3M6.5 7l1 13h9l1-13M10 11v5M14 11v5"></path></g>
        <g id="i-down"><path d="M6 9l6 6 6-6"></path></g>
        <g id="i-cal"><rect x="4" y="5" width="16" height="15" rx="3"></rect><path d="M4 10h16M8 3v4M16 3v4"></path></g>
        <g id="i-dial"><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="1.5"></circle></g>
        <g id="crane-mast">
          <path className="cw" d="M398 92V900M422 92V900"></path>
          <path className="cd" d="M398 92L422 116L398 140L422 164L398 188L422 212L398 236L422 260L398 284L422 308L398 332L422 356L398 380L422 404L398 428L422 452L398 476L422 500L398 524L422 548L398 572L422 596L398 620L422 644L398 668L422 692L398 716L422 740L398 764L422 788L398 812L422 836L398 860L422 884"></path>
        </g>
        <g id="crane-jib">
          <path className="cw" d="M28 84H392M28 84L64 64H398"></path>
          <path className="cd" d="M64 84L73 64L91 84L109 64L127 84L145 64L163 84L181 64L199 84L217 64L235 84L253 64L271 84L289 64L307 84L325 64L343 84L361 64L379 84L397 64"></path>
          <path className="cw" d="M392 84h36v8h-36zM374 92h20v20h-14a6 6 0 0 1-6-6zM422 70H524L532 84H428"></path>
          <path className="cd" d="M442 70V84M460 70V84M478 70V84M496 70V84"></path>
          <path className="cw" d="M398 64L410 14L422 70M403 44H417"></path>
          <path className="cd" d="M410 14L140 64M410 14L272 64M410 14L510 70"></path>
          <rect className="cf" x="494" y="84" width="34" height="28" rx="3"></rect>
        </g>
        <g id="crane-trolley">
          <path className="co" d="M338 87h24v7h-24z"></path>
          <circle className="co" cx="343" cy="86" r="2"></circle>
          <circle className="co" cx="357" cy="86" r="2"></circle>
        </g>
        <g id="crane-cable"><path className="co" d="M350 94V138"></path></g>
        <g id="crane-block"><path className="co" d="M345 138h10l-1.5 7h-7zM350 145v4a4.5 4.5 0 1 1-4.5 4.5"></path></g>
        <g id="crane-sling"><path className="co" d="M346 160L322 186M354 160L378 186"></path></g>
        <g id="crane-plate"><rect className="cf" x="318" y="186" width="64" height="10" rx="2"></rect></g>
        <g id="crane-bld">
          <path className="bw" d="M233 248V900M269 248V900M305 248V900"></path>
          <path className="bsl" d="M269 236V900"></path>
          <path className="cw" d="M215 214V900M251 222V900M287 214V900M323 222V900"></path>
          <path className="bt" d="M331 256V900"></path>
          <path className="cd" d="M339 236V900"></path>
          <rect className="cf" x="259" y="288" width="20" height="18"></rect>
          <rect className="cf" x="295" y="368" width="20" height="18"></rect>
          <rect className="cf" x="223" y="408" width="20" height="18"></rect>
          <rect className="cf" x="259" y="528" width="20" height="18"></rect>
          <rect className="cf" x="295" y="608" width="20" height="18"></rect>
        </g>
        <g id="scaf"><path className="cs" d="M8 0V120M40 0V120M0 20H48M0 40H48M0 60H48M0 80H48M0 100H48M8 20L40 40L8 60L40 80L8 100L40 120"></path></g>
        <g id="bricks"><path className="cb" d="M0 0H260M0 0v24M56 0v24M112 0v24M168 0v24M224 0v24M0 24H260M28 24v24M84 24v24M140 24v24M196 24v24M252 24v24M0 48H260M0 48v24M56 48v24M112 48v24M168 48v24M224 48v24M0 72H260M28 72v24M84 72v24M140 72v24M196 72v24M252 72v24M0 96H260M0 96v24M56 96v24M112 96v24M168 96v24M224 96v24M0 120H260M28 120v24M84 120v24M140 120v24M196 120v24M252 120v24M0 144H260"></path></g>
      </defs>
    </svg>
  );
}
