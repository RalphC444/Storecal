// Client hook for live calendar updates. Opens one Socket.IO connection
// (same-origin — dev is proxied by Vite, prod is served by the API) and calls
// `onChange` whenever an appointment is created, edited, or has its status
// changed for this shop. The socket authenticates via the httpOnly auth cookie,
// which the browser sends on the handshake automatically.
import { useEffect, useRef } from "react";
import { io } from "socket.io-client";

export function useAppointmentEvents(onChange) {
  // Keep the latest callback without reconnecting the socket on every render.
  const cb = useRef(onChange);
  cb.current = onChange;

  useEffect(() => {
    const socket = io({ withCredentials: true });
    const handler = (payload) => cb.current?.(payload);
    socket.on("appointment:changed", handler);
    return () => {
      socket.off("appointment:changed", handler);
      socket.disconnect();
    };
  }, []);
}
