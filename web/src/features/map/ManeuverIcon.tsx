// Turn-arrow icons for the navigation banner. Drawn as stroked SVG so they scale and inherit color.

const MIRROR = 'translate(24,0) scale(-1,1)';

function Straight({ rotate = 0 }: { rotate?: number }) {
  return (
    <g transform={`rotate(${rotate} 12 12)`}>
      <path d="M12 21V5" />
      <path d="M6.5 10.5 12 5l5.5 5.5" />
    </g>
  );
}

function Elbow() {
  // A right turn; mirrored for left.
  return (
    <>
      <path d="M7 21v-8a5 5 0 0 1 5-5h6" />
      <path d="m14.5 4.5 4 3.5-4 3.5" />
    </>
  );
}

function UTurn() {
  // U-turn to the left: up, around, and back down.
  return (
    <>
      <path d="M16 21V9a4 4 0 0 0-8 0v6" />
      <path d="m4.8 12.2 3.2 3.6 3.2-3.6" />
    </>
  );
}

function Roundabout({ exitAngle }: { exitAngle: number }) {
  return (
    <>
      <circle cx="12" cy="14" r="4" />
      <path d="M12 21v-3" />
      <g transform={`rotate(${exitAngle} 12 14)`}>
        <path d="M12 10V3" />
        <path d="m8.5 6.2 3.5-3.4 3.5 3.4" />
      </g>
    </>
  );
}

export function ManeuverIcon({ maneuver, size = 40, className = '' }: { maneuver: string; size?: number; className?: string }) {
  const m = maneuver || 'STRAIGHT';
  const left = m.includes('LEFT');
  let body: JSX.Element;
  let mirror = false;

  if (m === 'DESTINATION') {
    body = (
      <g fill="currentColor" stroke="none">
        <path d="M12 22s-7-6.4-7-12a7 7 0 1 1 14 0c0 5.6-7 12-7 12Z" />
        <circle cx="12" cy="10" r="2.6" fill="#0b6b3a" />
      </g>
    );
  } else if (m.startsWith('UTURN')) {
    body = <UTurn />;
    mirror = !left; // drawn as a left U-turn
  } else if (m.startsWith('ROUNDABOUT')) {
    body = <Roundabout exitAngle={left ? -70 : 70} />;
  } else if (m === 'TURN_SLIGHT_LEFT' || m === 'TURN_SLIGHT_RIGHT' || m === 'FORK_LEFT' || m === 'FORK_RIGHT' || m === 'RAMP_LEFT' || m === 'RAMP_RIGHT' || m === 'KEEP_LEFT' || m === 'KEEP_RIGHT') {
    body = <Straight rotate={left ? -38 : 38} />;
  } else if (m === 'TURN_SHARP_LEFT' || m === 'TURN_SHARP_RIGHT') {
    body = <Straight rotate={left ? -135 : 135} />;
  } else if (m === 'TURN_LEFT' || m === 'TURN_RIGHT') {
    body = <Elbow />;
    mirror = left;
  } else {
    body = <Straight />; // DEPART, STRAIGHT, NAME_CHANGE, MERGE, FERRY...
  }

  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {mirror ? <g transform={MIRROR}>{body}</g> : body}
    </svg>
  );
}
