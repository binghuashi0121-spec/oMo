/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_USE_MOCK?: string;
  readonly VITE_ADMIN_API_BASE?: string;
  readonly VITE_TENCENT_MAP_KEY?: string;
  readonly VITE_APP_TITLE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare global {
  interface Window {
    TMap?: any;
  }
}

export {};
