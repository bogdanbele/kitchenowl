import { io, type Socket } from "socket.io-client";
import { tokens } from "./client";
import type { ShoppinglistItem } from "./types";

/**
 * Live updates for the shopping list.
 *
 * The backend already emits to a `household/<id>` room on every add and remove;
 * nothing here needed writing on the server. Without it, two people shopping
 * from one list each see their own stale copy — the exact case a shared
 * household exists for.
 *
 * Transport is pinned to polling. A browser cannot set headers on a WebSocket
 * handshake, and the server authenticates the socket with the same
 * Authorization header it uses for HTTP (verify_jwt_in_request). The Flutter
 * web build pins polling for the same reason.
 */
export interface ShoppinglistEvent {
  item: ShoppinglistItem & { shoppinglist_id?: number };
  shoppinglist: { id: number };
}

let socket: Socket | null = null;

export function connectLive(): Socket | null {
  const token = tokens.access;
  if (!token) return null;
  if (socket?.connected) return socket;

  socket ??= io({
    path: "/socket.io",
    transports: ["polling"],
    extraHeaders: { Authorization: `Bearer ${token}` },
    reconnectionDelay: 2000,
    reconnectionDelayMax: 6000,
    autoConnect: false,
  });

  if (!socket.connected) socket.connect();
  return socket;
}

export function disconnectLive() {
  socket?.disconnect();
  socket = null;
}

/**
 * The server disconnects a socket whose token it cannot verify rather than
 * answering an error, so an expired access token looks exactly like a network
 * drop. Rebuilding the socket with the current token on reconnect is what stops
 * a refresh mid-session from silently ending live updates for the rest of it.
 */
export function refreshLiveAuth() {
  if (!socket) return;
  const token = tokens.access;
  if (!token) return disconnectLive();
  socket.io.opts.extraHeaders = { Authorization: `Bearer ${token}` };
}
