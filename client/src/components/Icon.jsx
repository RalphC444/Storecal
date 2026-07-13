// Inline stroke icons (no dependency). 24-grid, inherits currentColor.
export function Icon({ name }) {
  const paths = {
    calendar: (
      <>
        <rect x="3" y="4.5" width="18" height="16" rx="2" />
        <path d="M3 9h18M8 3v3M16 3v3" />
      </>
    ),
    clients: (
      <>
        <path d="M16 20v-1.5a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V20" />
        <circle cx="9" cy="7" r="3.5" />
        <path d="M22 20v-1.5a4 4 0 0 0-3-3.87" />
        <path d="M15 3.63a4 4 0 0 1 0 7.75" />
      </>
    ),
    scissors: (
      <>
        <circle cx="6" cy="6.5" r="2.3" />
        <circle cx="6" cy="17.5" r="2.3" />
        <path d="M8 8l12 8.5M8 16l12-8.5" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    menu: <path d="M3 6h18M3 12h18M3 18h18" />,
    chevronLeft: <path d="M15 6l-6 6 6 6" />,
    chevronRight: <path d="M9 6l6 6-6 6" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7.5V12l3 2" />
      </>
    ),
    tag: (
      <>
        <path d="M20.6 13.4l-7.2 7.2a1.9 1.9 0 0 1-2.7 0l-6.9-6.9A1.9 1.9 0 0 1 3.3 12.4V5a1.7 1.7 0 0 1 1.7-1.7h7.4a1.9 1.9 0 0 1 1.3.6l6.9 6.9a1.9 1.9 0 0 1 0 2.6z" />
        <circle cx="7.8" cy="7.8" r="1.2" />
      </>
    ),
    signout: (
      <>
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <path d="M16 17l5-5-5-5M21 12H9" />
      </>
    ),
    eye: (
      <>
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
    eyeOff: (
      <>
        <path d="M9.9 5.2A9.5 9.5 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4M6.2 6.2A17 17 0 0 0 2 12s3.5 7 10 7a9.5 9.5 0 0 0 4.2-.9" />
        <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
        <path d="M3 3l18 18" />
      </>
    ),
    image: (
      <>
        <rect x="3" y="4.5" width="18" height="15" rx="2" />
        <circle cx="8.5" cy="9.5" r="1.6" />
        <path d="M4 17l5-5 4 4 3-3 4 4" />
      </>
    ),
    user: (
      <>
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5 20a7 7 0 0 1 14 0" />
      </>
    ),
    lock: (
      <>
        <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
        <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
      </>
    ),
    globe: (
      <>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M3.5 12h17M12 3.5c2.4 2.6 2.4 14.4 0 17M12 3.5c-2.4 2.6-2.4 14.4 0 17" />
      </>
    ),
    card: (
      <>
        <rect x="3" y="5.5" width="18" height="13" rx="2" />
        <path d="M3 9.5h18" />
      </>
    ),
    link: (
      <>
        <path d="M10.5 6.8l1.7-1.7a3.6 3.6 0 0 1 5.1 5.1l-2.4 2.4" />
        <path d="M13.5 17.2l-1.7 1.7a3.6 3.6 0 0 1-5.1-5.1l2.4-2.4" />
        <path d="M9.5 14.5l5-5" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </>
    ),
  };
  return (
    <svg
      className="ico"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
