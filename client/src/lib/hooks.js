import { useState, useEffect } from "react";

// Only surfaces `active` after `ms` — avoids loader flashes on fast responses.
export function useDelayed(active, ms = 500) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!active) {
      setShown(false);
      return;
    }
    const t = setTimeout(() => setShown(true), ms);
    return () => clearTimeout(t);
  }, [active, ms]);
  return shown;
}

// True when the viewport is phone-sized (drives the single-day calendar).
export function useIsMobile(bp = 860) {
  const [m, setM] = useState(() => typeof window !== "undefined" && window.innerWidth <= bp);
  useEffect(() => {
    const on = () => setM(window.innerWidth <= bp);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, [bp]);
  return m;
}
