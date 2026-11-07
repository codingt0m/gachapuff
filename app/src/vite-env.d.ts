/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  /** "1" gives unlimited boosters, like ?dev=1. */
  readonly VITE_DEV_UNLIMITED?: string;
}

/** Injected by vite.config.ts from package.json. */
declare const __APP_VERSION__: string;
