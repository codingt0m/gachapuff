/** Line icons (24×24, currentColor). Decorative: always paired with a text label. */
const PATHS = {
  booster: 'M6 3h12l-1 3l1 3l-1 3l1 3l-1 3l1 3H6l1-3l-1-3l1-3l-1-3l1-3Z M10 10h4 M10 14h4',
  album: 'M4 4h7v7H4Z M13 4h7v7h-7Z M4 13h7v7H4Z M13 13h7v7h-7Z',
  recycle: 'M7 7l3-4l3 4 M10 3v9 M17 10l4 3l-4 3 M21 13h-9 M7 21l-4-3l4-3 M3 18h9',
  settings:
    'M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8Z M12 2v3 M12 19v3 M2 12h3 M19 12h3 M4.9 4.9l2.1 2.1 M17 17l2.1 2.1 M4.9 19.1L7 17 M17 7l2.1-2.1',
  soundOn: 'M4 9h4l5-4v14l-5-4H4Z M16 9a4 4 0 0 1 0 6 M18.5 6.5a8 8 0 0 1 0 11',
  soundOff: 'M4 9h4l5-4v14l-5-4H4Z M16 9l5 6 M21 9l-5 6',
  back: 'M15 5l-7 7l7 7',
  close: 'M6 6l12 12 M18 6L6 18',
  check: 'M5 12l5 5l9-10',
  sparkle: 'M12 3l2 7l7 2l-7 2l-2 7l-2-7l-7-2l7-2Z',
  filter: 'M4 5h16 M7 12h10 M10 19h4',
  gyro: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18Z M3 12h18 M12 3c3 3 3 15 0 18',
  download: 'M12 4v11 M7 10l5 5l5-5 M5 20h14',
  upload: 'M12 20V9 M7 14l5-5l5 5 M5 4h14',
  trash: 'M5 7h14 M9 7V4h6v3 M7 7l1 13h8l1-13',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 24 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
