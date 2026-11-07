import { useEffect, useState } from 'react';
import { bootGame, type BootResult } from '../store/boot.ts';
import { GameProvider } from '../store/GameProvider.tsx';
import { App } from './App.tsx';
import { ToastProvider } from './components/Toast.tsx';
import { ErrorScreen } from './screens/ErrorScreen.tsx';
import { SplashScreen } from './screens/SplashScreen.tsx';

type BootState =
  | { status: 'loading' }
  | { status: 'ready'; result: BootResult }
  | { status: 'error'; error: Error };

export function Boot() {
  const [state, setState] = useState<BootState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    bootGame().then(
      (result) => !cancelled && setState({ status: 'ready', result }),
      (error: unknown) =>
        !cancelled &&
        setState({
          status: 'error',
          error: error instanceof Error ? error : new Error(String(error)),
        }),
    );
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === 'loading') return <SplashScreen />;
  if (state.status === 'error') return <ErrorScreen error={state.error} />;
  return (
    <GameProvider store={state.result.store}>
      <ToastProvider>
        <App notices={state.result.notices} />
      </ToastProvider>
    </GameProvider>
  );
}
