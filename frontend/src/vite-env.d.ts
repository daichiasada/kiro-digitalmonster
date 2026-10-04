/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the backend API Gateway stage, e.g. https://xxxx.execute-api.region.amazonaws.com/prod */
  readonly VITE_API_BASE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module '*.svg' {
  const src: string;
  export default src;
}
