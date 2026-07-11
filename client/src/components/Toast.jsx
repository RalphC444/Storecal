import { useState, useEffect } from "react";

// Lightweight toast: call toast("Saved") from anywhere; <ToastHost/> renders them.
let _emitToast = null;
export function toast(message) {
  if (_emitToast) _emitToast(message);
}

export function ToastHost() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    let seq = 0;
    _emitToast = (message) => {
      const id = ++seq;
      setItems((list) => [...list, { id, message }]);
      setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), 2400);
    };
    return () => {
      _emitToast = null;
    };
  }, []);
  return (
    <div className="toast-host" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className="toast">
          ✓ {t.message}
        </div>
      ))}
    </div>
  );
}
