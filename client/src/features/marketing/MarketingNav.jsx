import { useState, useEffect } from "react";
import { BrandLogo } from "../../components/BrandLogo";

// Shared marketing nav — identical header on the home page and every standalone
// marketing page (product, pricing), so navigation is consistent everywhere.
// Manages its own scroll-background + mobile-menu state.
export function MarketingNav({ onHome, onProduct, onPricing, onGetWebsite, onCreateAccount, onSignIn }) {
  const [navOpen, setNavOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 18);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const go = (fn) => () => { setNavOpen(false); fn?.(); };

  return (
    <header className={"marketing__nav" + (scrolled ? " is-scrolled" : "") + (navOpen ? " is-open" : "")}>
      <div className="marketing__navwrap">
        <button className="linklike marketing__brand" onClick={go(onHome)} aria-label="StoreCal home">
          <span className="brand__mark"><BrandLogo /></span>
          <span className="marketing__brandname">StoreCal</span>
        </button>
        <nav className="marketing__links" aria-label="Primary">
          <button className="linklike marketing__link" onClick={go(onProduct)}>Features</button>
          <button className="linklike marketing__link" onClick={go(onProduct)}>How it works</button>
          <button className="linklike marketing__link" onClick={go(onPricing)}>Pricing</button>
          <button className="linklike marketing__link" onClick={go(onGetWebsite)}>Get a website</button>
          <button className="linklike marketing__link" onClick={go(onCreateAccount)}>Create account</button>
          <button className="mbtn mbtn--nav" onClick={go(onSignIn)}>Sign in</button>
        </nav>
        <button
          className="marketing__navtoggle"
          aria-label="Toggle menu"
          aria-expanded={navOpen}
          onClick={() => setNavOpen((v) => !v)}
        >
          <span /><span />
        </button>
      </div>
    </header>
  );
}
