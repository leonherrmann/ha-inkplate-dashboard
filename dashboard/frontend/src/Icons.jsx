// The design's icon set, transcribed path for path.
//
// All of them are 24x24 stroke outlines on `currentColor`, so an icon takes its
// colour from whatever it sits in -- a tinted token, a gradient pill, a plain
// row -- without a variant per context. Size is a prop because the design uses
// a handful of specific sizes (13 in a button, 15 in an icon button, 19 in the
// rail) rather than one.
//
// Stroke width varies deliberately: 1.9 for navigation and furniture, 2+ for
// anything on a coloured fill, where a thin line disappears.

function Svg({ size = 16, width = 1.9, children, ...rest }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

/* ---------- navigation ---------- */

export const GridIcon = (props) => (
  <Svg {...props}>
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
  </Svg>
);

export const LayersIcon = (props) => (
  <Svg {...props}>
    <path d="M12 3 3 8l9 5 9-5-9-5z" />
    <path d="M3 14l9 5 9-5" />
  </Svg>
);

export const SlidersIcon = (props) => (
  <Svg {...props}>
    <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
    <circle cx="15" cy="7" r="2.4" />
    <circle cx="9" cy="17" r="2.4" />
  </Svg>
);

export const ImageIcon = (props) => (
  <Svg {...props}>
    <rect x="3" y="4" width="18" height="16" rx="2.5" />
    <circle cx="9" cy="10" r="2" />
    <path d="m4 19 6-6 4 4 3-3 4 4" />
  </Svg>
);

/* ---------- actions ---------- */

export const PushIcon = (props) => (
  <Svg width={2.4} {...props}>
    <path d="M12 19V5M5 12l7-7 7 7" />
  </Svg>
);

export const UndoIcon = (props) => (
  <Svg {...props}>
    <path d="M3 7v6h6" />
    <path d="M3.5 13a9 9 0 1 0 2.6-7" />
  </Svg>
);

export const RedoIcon = (props) => (
  <Svg {...props}>
    <path d="M21 17v-6h-6" />
    <path d="M20.5 11a9 9 0 1 0-2.6 7" />
  </Svg>
);

export const DuplicateIcon = (props) => (
  <Svg {...props}>
    <rect x="8" y="8" width="13" height="13" rx="2" />
    <path d="M16 3H4v12" />
  </Svg>
);

export const FrontIcon = (props) => (
  <Svg {...props}>
    <rect x="3" y="3" width="12" height="12" rx="2" />
    <path d="M9 21h10a2 2 0 0 0 2-2V9" />
  </Svg>
);

export const BackIcon = (props) => (
  <Svg {...props}>
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path d="M15 3H5a2 2 0 0 0-2 2v10" />
  </Svg>
);

export const TrashIcon = (props) => (
  <Svg {...props}>
    <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
  </Svg>
);

export const PencilIcon = (props) => (
  <Svg {...props}>
    <path d="M4 20h4L20 8l-4-4L4 16z" />
  </Svg>
);

export const SearchIcon = (props) => (
  <Svg width={2} {...props}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-4-4" />
  </Svg>
);

export const RefreshIcon = (props) => (
  <Svg {...props}>
    <path d="M3 12a9 9 0 1 0 9-9" />
    <path d="M3 5v7h7" />
  </Svg>
);

export const GripIcon = ({ size = 16, ...rest }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...rest}>
    <circle cx="9" cy="6" r="1.6" />
    <circle cx="15" cy="6" r="1.6" />
    <circle cx="9" cy="12" r="1.6" />
    <circle cx="15" cy="12" r="1.6" />
    <circle cx="9" cy="18" r="1.6" />
    <circle cx="15" cy="18" r="1.6" />
  </svg>
);

/* ---------- chevrons ---------- */

export const ChevronRight = (props) => (
  <Svg width={2} {...props}>
    <path d="m9 6 6 6-6 6" />
  </Svg>
);

export const ChevronDown = (props) => (
  <Svg width={2.2} {...props}>
    <path d="m6 9 6 6 6-6" />
  </Svg>
);

export const ChevronLeft = (props) => (
  <Svg width={2} {...props}>
    <path d="m15 6-6 6 6 6" />
  </Svg>
);

export const ArrowRight = (props) => (
  <Svg width={2} {...props}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Svg>
);

/* ---------- state ---------- */

export const WarningIcon = (props) => (
  <Svg width={2} {...props}>
    <path d="M12 3 2 20h20L12 3z" />
    <path d="M12 9v5M12 17h.01" />
  </Svg>
);

export const InfoIcon = (props) => (
  <Svg width={2} {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8h.01M11 12h1v4h1" />
  </Svg>
);

export const CheckIcon = (props) => (
  <Svg width={2} {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="m8 12 2.5 2.5L16 9" />
  </Svg>
);

export const ClockIcon = (props) => (
  <Svg width={2} {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Svg>
);

export const QuestionIcon = (props) => (
  <Svg width={2} {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3V14" />
    <path d="M12 17.5h.01" />
  </Svg>
);

export const LockIcon = (props) => (
  <Svg width={2} {...props}>
    <rect x="4" y="10" width="16" height="10" rx="2.5" />
    <path d="M8 10V8a4 4 0 0 1 8 0v2" />
  </Svg>
);

/* ---------- device ---------- */

export const MonitorIcon = (props) => (
  <Svg width={2.2} {...props}>
    <rect x="2" y="4" width="20" height="14" rx="2" />
    <path d="M8 21h8" />
  </Svg>
);

export const OrientIcon = (props) => (
  <Svg width={2} {...props}>
    <path d="M4 8V4h4M20 16v4h-4" />
    <rect x="4" y="8" width="16" height="8" rx="2" />
  </Svg>
);

export const MoonIcon = (props) => (
  <Svg width={2} {...props}>
    <path d="M20 14a8 8 0 1 1-9.9-9.9A7 7 0 0 0 20 14z" />
  </Svg>
);

export const TimerIcon = (props) => (
  <Svg width={2} {...props}>
    <circle cx="12" cy="13" r="8" />
    <path d="M12 9v4l2 2M9 2h6" />
  </Svg>
);

export const WifiSetupIcon = (props) => (
  <Svg {...props}>
    <path d="M5 12.5a10 10 0 0 1 14 0" />
    <circle cx="12" cy="18" r="1.4" />
  </Svg>
);

export const HomeIcon = (props) => (
  <Svg {...props}>
    <path d="M3 10 12 3l9 7v10H3z" />
    <path d="M9 20v-6h6v6" />
  </Svg>
);

export const DeviceIcon = (props) => (
  <Svg width={2} {...props}>
    <rect x="4" y="4" width="16" height="16" rx="3" />
    <path d="M4 12h16" />
  </Svg>
);

export const DropIcon = (props) => (
  <Svg width={2} {...props}>
    <path d="M12 3c3 4 6 6.5 6 10a6 6 0 0 1-12 0c0-3.5 3-6 6-10z" />
  </Svg>
);

/* ---------- entity domains ---------- */

// One glyph per domain the pickers commonly show, and a neutral mark for
// everything else. A wrong-but-confident icon is worse than an honest generic
// one, so anything unrecognised gets the dot rather than a guess.
const DOMAIN_PATHS = {
  light: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" />
    </>
  ),
  switch: (
    <>
      <rect x="3" y="7" width="18" height="10" rx="5" />
      <circle cx="16" cy="12" r="2.6" />
    </>
  ),
  climate: (
    <>
      <path d="M10 14V5a2 2 0 1 1 4 0v9" />
      <circle cx="12" cy="17" r="3.2" />
    </>
  ),
  cover: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18M3 14h18" />
    </>
  ),
  lock: (
    <>
      <rect x="4" y="10" width="16" height="10" rx="2.5" />
      <path d="M8 10V8a4 4 0 0 1 8 0v2" />
    </>
  ),
  media_player: (
    <>
      <rect x="3" y="5" width="18" height="12" rx="2.5" />
      <path d="M8 21h8" />
    </>
  ),
  binary_sensor: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  fan: (
    <>
      <circle cx="12" cy="12" r="2" />
      <path d="M12 10c0-3 1-6 4-6s3 4 0 5M14 12c3 0 6 1 6 4s-4 3-5 0M12 14c0 3-1 6-4 6s-3-4 0-5M10 12c-3 0-6-1-6-4s4-3 5 0" />
    </>
  ),
  person: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </>
  ),
  vacuum: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  update: (
    <>
      <path d="M12 19V5M5 12l7-7 7 7" />
    </>
  ),
  sensor: (
    <>
      <path d="M12 3c3 4 6 6.5 6 10a6 6 0 0 1-12 0c0-3.5 3-6 6-10z" />
    </>
  ),
};

export const DomainIcon = ({ domain, ...rest }) => (
  <Svg width={2} {...rest}>
    {DOMAIN_PATHS[domain] || (
      <>
        <circle cx="12" cy="12" r="8" />
        <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
      </>
    )}
  </Svg>
);
