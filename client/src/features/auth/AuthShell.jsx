import { BrandLogo } from "../../components/BrandLogo";

// Centered card wrapper shared by every auth screen (sign in, reset, etc.).
export function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="authwrap">
      <div className="authcard">
        <div className="authcard__brand">
          <span className="saas__mark">
            <BrandLogo />
          </span>
          <span className="saas__name">StoreCal</span>
        </div>
        <h1 className="authcard__title">{title}</h1>
        {subtitle && <p className="authcard__sub">{subtitle}</p>}
        {children}
        {footer && <div className="authcard__foot">{footer}</div>}
      </div>
    </div>
  );
}
