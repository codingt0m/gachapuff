import { memo, useMemo, type CSSProperties, type RefObject } from 'react';
import type { layout } from '../../../config/layout.ts';
import { baseTierFor } from '../../../domain/catalog.ts';
import type { GameConfig } from '../../../domain/types.ts';
import { ProgressBar } from '../../components/ProgressBar.tsx';
import { PuffThumb } from '../../components/PuffThumb.tsx';
import { formatPuffs } from '../../format.ts';
import { paths } from '../../router.ts';
import type { AlbumEntry, AlbumSection } from './albumModel.ts';
import { useElementWidth, useWindowVirtualizer } from './useWindowVirtualizer.ts';
import styles from './AlbumGrid.module.css';

type Row =
  | { kind: 'header'; key: string; section: AlbumSection }
  | { kind: 'items'; key: string; entries: AlbumEntry[] };

/**
 * One row of thumbnails. Memoised: scrolling changes the rendered range, and without it
 * every visible row (and its thumbnails) re-rendered at each step.
 */
const ItemsRow = memo(function ItemsRow({
  entries,
  offset,
  cols,
  gap,
}: {
  entries: AlbumEntry[];
  offset: number;
  cols: number;
  gap: number;
}) {
  return (
    <div
      className={styles.row}
      style={{
        transform: `translateY(${offset}px)`,
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gap,
      }}
    >
      {entries.map((entry) => (
        <PuffThumb
          key={entry.puff.id}
          puff={entry.puff}
          instance={entry.instances[0]}
          count={entry.count}
          href={paths.puff(entry.puff.id)}
        />
      ))}
    </div>
  );
});

export function AlbumGrid({
  containerRef,
  sections,
  config,
  albumLayout,
}: {
  containerRef: RefObject<HTMLDivElement | null>;
  sections: AlbumSection[];
  config: GameConfig;
  albumLayout: (typeof layout)['album'];
}) {
  const width = useElementWidth(containerRef);
  const { gap, nameHeight, headerHeight } = albumLayout;
  const minThumb =
    typeof window !== 'undefined' && window.innerWidth >= albumLayout.wideBreakpoint
      ? albumLayout.minThumbWide
      : albumLayout.minThumb;
  const cols = Math.max(2, Math.floor((width + gap) / (minThumb + gap)));
  const cell = width > 0 ? (width - gap * (cols - 1)) / cols : minThumb;

  const rows = useMemo(() => {
    const result: Row[] = [];
    for (const section of sections) {
      if (section.model) result.push({ kind: 'header', key: `h-${section.model}`, section });
      for (let i = 0; i < section.entries.length; i += cols) {
        result.push({
          kind: 'items',
          key: `${section.model ?? 'all'}-${i}`,
          entries: section.entries.slice(i, i + cols),
        });
      }
    }
    return result;
  }, [sections, cols]);

  const heights = useMemo(
    () => rows.map((r) => (r.kind === 'header' ? headerHeight : cell + nameHeight + gap)),
    [rows, cell, headerHeight, nameHeight, gap],
  );
  const { range, offsets, total } = useWindowVirtualizer(containerRef, heights);

  return (
    <div className={styles.grid} style={{ height: total }}>
      {rows.slice(range.start, range.end).map((row, i) => {
        const index = range.start + i;
        const style: CSSProperties = { transform: `translateY(${offsets[index] ?? 0}px)` };
        if (row.kind === 'header') {
          const { section } = row;
          const model = section.model ?? '';
          const firstPuff = section.entries[0]?.puff;
          const tier = config.baseTiers.tiers[baseTierFor(model, firstPuff?.puffs ?? null, config)];
          const complete = section.owned === section.total;
          return (
            <div key={row.key} className={styles.header} style={{ ...style, height: headerHeight }}>
              <div className={styles.headerTop}>
                <h2 className={styles.model}>{model}</h2>
                <span className={styles.tally} data-complete={complete}>
                  {complete ? '★ Complet ' : ''}
                  {section.owned}/{section.total}
                </span>
              </div>
              <p className={styles.meta}>
                {tier?.name} · {formatPuffs(firstPuff?.puffs ?? null)}
              </p>
              <ProgressBar
                size="sm"
                value={section.owned}
                max={section.total}
                label={`Progression ${model}`}
              />
            </div>
          );
        }
        return (
          <ItemsRow
            key={row.key}
            entries={row.entries}
            offset={offsets[index] ?? 0}
            cols={cols}
            gap={gap}
          />
        );
      })}
    </div>
  );
}
