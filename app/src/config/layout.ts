/** Layout constants used by JS-driven layouts (virtualised grids). Pixels. */
export const layout = {
  album: {
    minThumb: 100,
    minThumbWide: 128,
    wideBreakpoint: 640,
    gap: 12,
    /** Height of the name line under each thumbnail. */
    nameHeight: 22,
    /** Height of a model header row. */
    headerHeight: 84,
  },
} as const;
