import { BrandLogo } from "../../components/BrandLogo";
import { SUPPORT_EMAIL } from "./constants";

// Shared marketing footer — same on the home page and every standalone marketing
// page, so its Product/Company/Legal navigation is available everywhere.
export function MarketingFooter({ nav, onLegal }) {
  return (
    <footer className="marketing__foot">
      <div className="marketing__foot-grid">
        <div className="marketing__foot-brand">
          <button className="linklike marketing__brand" onClick={nav.onHome} aria-label="StoreCal home">
            <span className="brand__mark"><BrandLogo /></span>
            <span className="marketing__brandname marketing__brandname--foot">StoreCal</span>
          </button>
          <p>Online booking, scheduling, and calendar software for salons, barbershops, and local shops in Mount Vernon, Westchester County, and the greater New York area — a simple, affordable alternative to Square, Booksy, and Phorest.</p>
        </div>
        <div className="marketing__foot-col">
          <h4>Product</h4>
          <button className="linklike marketing__foot-link" onClick={nav.onHome}>Features</button>
          <button className="linklike marketing__foot-link" onClick={nav.onPricing}>Pricing</button>
          <button className="linklike marketing__foot-link" onClick={nav.onProduct}>How it works</button>
        </div>
        <div className="marketing__foot-col">
          <h4>Company</h4>
          <button className="linklike marketing__foot-link" onClick={nav.onGetWebsite}>Get a website</button>
          <a href={`mailto:${SUPPORT_EMAIL}`}>Contact</a>
        </div>
        <div className="marketing__foot-col">
          <h4>Legal</h4>
          <button className="linklike marketing__foot-link" onClick={() => onLegal("terms")}>Terms</button>
          <button className="linklike marketing__foot-link" onClick={() => onLegal("privacy")}>Privacy</button>
          <button className="linklike marketing__foot-link" onClick={() => onLegal("refunds")}>Refunds &amp; Cancellations</button>
        </div>
      </div>
      <div className="marketing__foot-bar">
        <span>© {new Date().getFullYear()} StoreCal · Booking for local business</span>
        <span>Built for local business</span>
      </div>
    </footer>
  );
}
