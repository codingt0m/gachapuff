import { useSyncExternalStore } from 'react';

/** Hash routes: work offline, from any static host, with no server rewrite. */
export type Route =
  | { name: 'booster' }
  | { name: 'album' }
  | { name: 'puff'; id: string; uid: string | null }
  | { name: 'recycle' }
  | { name: 'settings' }
  | { name: 'design' }
  | { name: 'showcase' }
  | { name: 'simulator' }
  | { name: 'sort' }
  | { name: 'notFound' };

export const paths = {
  booster: '#/',
  album: '#/album',
  puff: (id: string, uid?: string) =>
    `#/puff/${encodeURIComponent(id)}${uid ? `?u=${encodeURIComponent(uid)}` : ''}`,
  recycle: '#/recyclage',
  settings: '#/reglages',
  design: '#/dev/design',
  showcase: '#/dev/vitrine',
  simulator: '#/dev/simulateur',
  sort: '#/tri',
} as const;

export function parseHash(hash: string): Route {
  const [rawPath = '', query = ''] = hash.replace(/^#/, '').split('?');
  const path = rawPath.replace(/\/+$/, '') || '/';
  const params = new URLSearchParams(query);
  const puff = /^\/puff\/(.+)$/.exec(path);
  if (puff?.[1]) return { name: 'puff', id: decodeURIComponent(puff[1]), uid: params.get('u') };
  switch (path) {
    case '/':
      return { name: 'booster' };
    case '/album':
      return { name: 'album' };
    case '/recyclage':
      return { name: 'recycle' };
    case '/reglages':
      return { name: 'settings' };
    case '/dev/design':
      return { name: 'design' };
    case '/dev/vitrine':
      return { name: 'showcase' };
    case '/dev/simulateur':
      return { name: 'simulator' };
    case '/tri':
      return { name: 'sort' };
    default:
      return { name: 'notFound' };
  }
}

const subscribe = (onChange: () => void) => {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
};

export function useHash(): string {
  return useSyncExternalStore(subscribe, () => window.location.hash);
}

export function navigate(path: string, { replace = false } = {}): void {
  if (replace) {
    window.history.replaceState(null, '', path);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    window.location.hash = path.replace(/^#/, '');
  }
}

/** Goes back when there is somewhere to go back to, else to a fallback route. */
export function goBack(fallback: string): void {
  if (window.history.length > 1) window.history.back();
  else navigate(fallback, { replace: true });
}
