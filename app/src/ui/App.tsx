import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { setHapticsEnabled } from '../effects/haptics.ts';
import { sound } from '../effects/sound.ts';
import type { BootNotice } from '../store/boot.ts';
import { useGame, useGameState, useSaveError } from '../store/GameProvider.tsx';
import { Header } from './components/Header.tsx';
import { TABS, TabBar } from './components/TabBar.tsx';
import { useToast } from './components/Toast.tsx';
import { RevealContext, type RevealRequest } from './reveal/RevealContext.tsx';
import { navigate, parseHash, useHash, type Route } from './router.ts';
import { BoosterScreen } from './screens/BoosterScreen.tsx';
import { ScreenSkeleton } from './screens/ScreenSkeleton.tsx';
import { bindMotionPreference } from './theme.ts';
import styles from './App.module.css';

const AlbumScreen = lazy(() => import('./screens/album/AlbumScreen.tsx'));
const PuffDetailScreen = lazy(() => import('./screens/PuffDetailScreen.tsx'));
const RecycleScreen = lazy(() => import('./screens/RecycleScreen.tsx'));
const SettingsScreen = lazy(() => import('./screens/SettingsScreen.tsx'));
const NotFoundScreen = lazy(() => import('./screens/NotFoundScreen.tsx'));
const DesignScreen = lazy(() => import('./screens/dev/DesignScreen.tsx'));
const ShowcaseScreen = lazy(() => import('./screens/dev/ShowcaseScreen.tsx'));
const SimulatorScreen = lazy(() => import('./screens/dev/SimulatorScreen.tsx'));
const loadRevealOverlay = () => import('./reveal/RevealOverlay.tsx');
const RevealOverlay = lazy(loadRevealOverlay);

const REGEN_CHECK_MS = 1000;

const NOTICE_MESSAGES: Record<BootNotice, string> = {
  'save-corrupted': 'Ta sauvegarde était illisible : nouvelle collection créée.',
  'storage-memory': 'Stockage indisponible : ta progression ne sera pas gardée.',
};

function Screen({ route }: { route: Route }) {
  switch (route.name) {
    case 'booster':
      return <BoosterScreen />;
    case 'album':
      return <AlbumScreen />;
    case 'puff':
      return <PuffDetailScreen id={route.id} uid={route.uid} />;
    case 'recycle':
      return <RecycleScreen />;
    case 'settings':
      return <SettingsScreen />;
    case 'design':
      return <DesignScreen />;
    case 'showcase':
      return <ShowcaseScreen />;
    case 'simulator':
      return <SimulatorScreen />;
    case 'notFound':
      return <NotFoundScreen />;
  }
}

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName));

export function App({ notices }: { notices: BootNotice[] }) {
  const store = useGame();
  const route = parseHash(useHash());
  const settings = useGameState((s) => s.settings);
  const saveError = useSaveError();
  const toast = useToast();
  const [reveal, setReveal] = useState<RevealRequest | null>(null);
  const announced = useRef(false);

  // Settings -> effect engines.
  useEffect(() => sound.setEnabled(settings.sound), [settings.sound]);
  useEffect(() => setHapticsEnabled(settings.haptics), [settings.haptics]);
  useEffect(() => bindMotionPreference(() => settings.motion), [settings.motion]);

  // Audio stays silent until the first interaction.
  useEffect(() => {
    // WebKit doesn't treat pointerdown/touchstart as audio-unlocking gestures; touchend/click it does.
    const unlock = () => sound.unlock();
    const events = ['pointerdown', 'touchend', 'click', 'keydown'] as const;
    events.forEach((e) => window.addEventListener(e, unlock, { capture: true }));
    return () => events.forEach((e) => window.removeEventListener(e, unlock, { capture: true }));
  }, []);

  // Booster regeneration.
  useEffect(() => {
    store.refreshBoosters();
    const id = window.setInterval(() => store.refreshBoosters(), REGEN_CHECK_MS);
    return () => window.clearInterval(id);
  }, [store]);

  useEffect(() => {
    if (announced.current) return;
    announced.current = true;
    notices.forEach((n) => toast(NOTICE_MESSAGES[n], 'warning'));
  }, [notices, toast]);

  useEffect(() => {
    if (saveError) toast('Sauvegarde impossible pour le moment.', 'warning');
  }, [saveError, toast]);

  // Desktop shortcuts: 1-4 switch tabs.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (reveal || event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target))
        return;
      const tab = TABS.find((t) => t.shortcut === event.key);
      if (tab) navigate(tab.href);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [reveal]);

  // The opening overlay (WebGL renderer included) is fetched ahead of the first booster.
  useEffect(() => {
    const id = window.setTimeout(() => void loadRevealOverlay().catch(() => {}), 500);
    return () => window.clearTimeout(id);
  }, []);

  // New screen: start at the top (the album restores its own scroll).
  useEffect(() => {
    if (route.name !== 'album') window.scrollTo(0, 0);
  }, [route.name]);

  return (
    <RevealContext.Provider value={setReveal}>
      <Header />
      <main id="main" tabIndex={-1} className={styles.main} inert={reveal ? true : undefined}>
        <Suspense fallback={<ScreenSkeleton />}>
          <Screen route={route} />
        </Suspense>
      </main>
      <TabBar active={route.name} />
      {reveal && (
        <Suspense fallback={null}>
          <RevealOverlay request={reveal} onClose={() => setReveal(null)} />
        </Suspense>
      )}
    </RevealContext.Provider>
  );
}
