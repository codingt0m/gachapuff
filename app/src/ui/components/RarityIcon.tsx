import type { RarityIcon as RarityIconName } from '../../domain/types.ts';

const SHAPES: Record<RarityIconName, string> = {
  circle: 'M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16Z',
  square: 'M5 5h14v14H5Z',
  triangle: 'M12 3l9.5 17h-19Z',
  diamond: 'M12 2l9 10l-9 10l-9-10Z',
  star: 'M12 2l2.9 6.6l7.1.7l-5.4 4.8l1.6 7L12 17.4l-6.2 3.7l1.6-7L2 9.3l7.1-.7Z',
  hexagon: 'M12 2l8.7 5v10L12 22l-8.7-5V7Z',
  crown: 'M3 8l4.5 4L12 4l4.5 8L21 8l-2 11H5Z',
};

/** A distinct shape per rarity, so rarity never relies on colour alone. */
export function RarityIcon({ icon, size = 16 }: { icon: RarityIconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d={SHAPES[icon]}
        fill="currentColor"
        stroke="rgb(0 0 0 / 0.45)"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}
