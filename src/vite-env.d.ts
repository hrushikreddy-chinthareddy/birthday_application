/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Public origin of the Express + Socket.IO server in production (no trailing slash). */
  readonly VITE_SOCKET_URL?: string;
}
