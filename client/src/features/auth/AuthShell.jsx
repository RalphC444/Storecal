import { BrandLogo } from "../../components/BrandLogo";

// Centered card wrapper shared by every auth screen (sign in, reset, etc.).
// `onBack` renders a page-level "Back to home" link pinned to the top-right,
// outside the card, so it reads as navigation rather than a form action.
export function AuthShell({ title, subtitle, children, footer, onBack }) {
  return (
    <div className="authwrap">
      {onBack && (
        <button type="button" className="authtop" onClick={onBack}>
          ← Back to home
        </button>
      )}
      <div className="authcard">
        <div className="authcard__brand">
          <span className="brand__mark">
            <BrandLogo />
          </span>
          <span className="brand__name">StoreCal</span>
        </div>
        <h1 className="authcard__title">{title}</h1>
        {subtitle && <p className="authcard__sub">{subtitle}</p>}
        {children}
        {footer && <div className="authcard__foot">{footer}</div>}
      </div>
    </div>
  );
}
