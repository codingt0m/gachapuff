import styles from './Logo.module.css';

/** The puff mark: a stylised vape with a smoke curl (also the app icon). */
export function PuffMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="pm-body" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffc95c" />
          <stop offset="0.45" stopColor="#ff2d87" />
          <stop offset="1" stopColor="#7b3cff" />
        </linearGradient>
        <linearGradient id="pm-smoke" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#22e0e6" />
        </linearGradient>
      </defs>
      <path
        d="M30 20c-6-2-6-9 0-10c-2-6 7-9 10-4c5-3 11 2 8 7c4 3 0 9-5 7"
        fill="none"
        stroke="url(#pm-smoke)"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <rect
        x="22"
        y="18"
        width="10"
        height="8"
        rx="2.5"
        fill="#160a2b"
        stroke="#160a2b"
        strokeWidth="2.5"
      />
      <rect
        x="16"
        y="24"
        width="22"
        height="34"
        rx="7"
        fill="url(#pm-body)"
        stroke="#160a2b"
        strokeWidth="3"
      />
      <rect x="20" y="29" width="4" height="22" rx="2" fill="#fff" opacity="0.45" />
      <circle cx="27" cy="51" r="2.5" fill="#22e0e6" />
    </svg>
  );
}

export function Logo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span className={`${styles.logo} ${styles[size]}`}>
      <PuffMark size={size === 'lg' ? 64 : size === 'md' ? 36 : 28} />
      <span className={styles.word} aria-label="Gachapuff">
        <span aria-hidden="true">Gacha</span>
        <span aria-hidden="true" className={styles.puff}>
          puff
        </span>
      </span>
    </span>
  );
}
