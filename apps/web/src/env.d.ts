interface ImportMetaEnv {
  /** `mock` (default in development) serves the API from MSW; `live` calls the real API. */
  readonly VITE_API_MODE?: 'mock' | 'live';
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
