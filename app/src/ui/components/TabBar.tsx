import { useGameState } from '../../store/GameProvider.tsx';
import { feedback } from '../feedback.ts';
import { paths, type Route } from '../router.ts';
import { Icon, type IconName } from './Icons.tsx';
import styles from './TabBar.module.css';

interface Tab {
  route: Route['name'];
  href: string;
  label: string;
  icon: IconName;
  shortcut: string;
}

export const TABS: Tab[] = [
  { route: 'booster', href: paths.booster, label: 'Booster', icon: 'booster', shortcut: '1' },
  { route: 'album', href: paths.album, label: 'Album', icon: 'album', shortcut: '2' },
  { route: 'recycle', href: paths.recycle, label: 'Recyclage', icon: 'recycle', shortcut: '3' },
  { route: 'settings', href: paths.settings, label: 'Réglages', icon: 'settings', shortcut: '4' },
];

export function TabBar({ active }: { active: Route['name'] }) {
  const boosters = useGameState((s) => s.boosters.stock);
  const current = active === 'puff' ? 'album' : active;
  return (
    <nav className={styles.bar} aria-label="Navigation principale">
      {TABS.map((tab) => (
        <a
          key={tab.route}
          href={tab.href}
          className={styles.tab}
          aria-current={current === tab.route ? 'page' : undefined}
          aria-keyshortcuts={tab.shortcut}
          onClick={() => feedback('tap')}
        >
          <span className={styles.icon}>
            <Icon name={tab.icon} />
            {tab.route === 'booster' && boosters > 0 && (
              <span
                className={styles.dot}
                aria-label={`${boosters} disponible${boosters > 1 ? 's' : ''}`}
              >
                {boosters}
              </span>
            )}
          </span>
          <span className={styles.label}>{tab.label}</span>
        </a>
      ))}
    </nav>
  );
}
