import { io, type Socket } from "socket.io-client";

let socket: Socket | null = null;

/**
 * Local dev: leave `VITE_SOCKET_URL` unset — Socket.IO uses the Vite dev server,
 * which proxies `/socket.io` to the API (see vite.config.ts).
 *
 * Production (Vercel UI + Render API): set `VITE_SOCKET_URL` to your Render Web
 * Service URL (e.g. `https://mystery-asset-api.onrender.com`), then redeploy Vercel.
 */
export function getSocket(): Socket {
  if (!socket) {
    const backend = import.meta.env.VITE_SOCKET_URL?.replace(/\/$/, "").trim() ?? "";
    socket = io(backend || undefined, {
      path: "/socket.io",
      transports: ["websocket", "polling"],
    });
  }
  return socket;
}
