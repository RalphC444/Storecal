import { useDelayed } from "../lib/hooks";

// Consistent page loader — the spinner only appears if loading exceeds 500ms,
// so fast responses never flash a spinner.
export function LoadingSpinner() {
  const show = useDelayed(true, 500);
  if (!show) return null;
  return (
    <div className="loader">
      <span className="spinner" aria-label="Loading" />
    </div>
  );
}
