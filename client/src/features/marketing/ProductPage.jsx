import { useEffect } from "react";
import { Icon } from "../../components/Icon";
import { BrandLogo } from "../../components/BrandLogo";
import { MARKETING_FEATURES } from "./constants";

// Standalone "Features & how it works" page — moved off the landing page into its
// own route. Reachable from the nav + footer. Kept intentionally simple: a sticky
// back bar, the two content sections, and a closing CTA.
export function ProductPage({ section, onBack, onGetStarted, onDemo }) {
  useEffect(() => {
    const el = section && document.getElementById(section === "how" ? "how" : "features");
    if (el) el.scrollIntoView({ block: "start" });
    else window.scrollTo(0, 0);
  }, [section]);

  return (
    <div className="marketing productpage">
      <header className="productpage__bar">
        <button className="marketing__brand linklike" onClick={onBack} aria-label="Back to StoreCal home">
          <span className="brand__mark"><BrandLogo /></span>
          <span className="marketing__brandname">StoreCal</span>
        </button>
        <button className="linklike productpage__back" onClick={onBack}>← Back to home</button>
      </header>

      <main className="productpage__body">
        {/* What you get */}
        <section className="marketing__section" id="features">
          <div className="marketing__sechead">
            <p className="marketing__section-eyebrow">What you get</p>
            <h2 className="marketing__h2">Everything to run the <em>front-desk.</em></h2>
            <p className="marketing__lede">
              One place for bookings, staff, hours, and clients — so the phone stops being your calendar.
            </p>
          </div>
          <div className="marketing__grid">
            {MARKETING_FEATURES.map((f, i) => (
              <div className={"marketing__card" + (i === 0 ? " marketing__card--feature" : "")} key={f.t}>
                <span className="marketing__cardicon"><Icon name={f.icon} /></span>
                <h3 className="marketing__ct">{f.t}</h3>
                <p className="marketing__cd">{f.d}</p>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="marketing__section" id="how">
          <div className="marketing__sechead">
            <p className="marketing__section-eyebrow">Up and running in minutes</p>
            <h2 className="marketing__h2">Three steps to <em>booked.</em></h2>
          </div>
          <div className="marketing__steps">
            {[
              { n: 1, t: "Set your hours & team", d: "Add your staff, services, and store hours." },
              { n: 2, t: "Add the booking widget", d: "Paste one line onto your site and clients book instantly." },
              { n: 3, t: "Manage from one calendar", d: "Every booking lands in your calendar — online, phone, or walk-in." },
            ].map((s) => (
              <div className="marketing__step" key={s.n}>
                <span className="marketing__num">{s.n}</span>
                <h3 className="marketing__ct">{s.t}</h3>
                <p className="marketing__cd">{s.d}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="productpage__cta">
          <button className="mbtn mbtn--primary" onClick={onGetStarted}>Start free →</button>
          <button className="mbtn mbtn--ghost" onClick={onDemo}>See the live demo →</button>
        </div>
      </main>
    </div>
  );
}
