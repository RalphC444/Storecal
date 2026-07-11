import { useState } from "react";
import { Icon } from "../../components/Icon";
import { BrandLogo } from "../../components/BrandLogo";
import { ApplyForWebsiteModal } from "./ApplyForWebsiteModal";
import { CONTACT_HREF, SUPPORT_EMAIL, MARKETING_FEATURES, MARKETING_PLANS } from "./constants";

// The public marketing landing page shown before sign-in.
export function LandingPage({ onSignIn, onDemo, onLegal }) {
  const [applyOpen, setApplyOpen] = useState(false);
  const [applyPlan, setApplyPlan] = useState("");
  const openApply = (plan) => {
    setApplyPlan(plan || "");
    setApplyOpen(true);
  };
  return (
    <div className="marketing" id="top">
      <header className="marketing__nav">
        <div className="marketing__navwrap">
          <a className="marketing__brand" href="#top">
            <span className="brand__mark">
              <BrandLogo />
            </span>
            <span className="brand__name">StoreCal</span>
          </a>
          <nav className="marketing__links">
            <a className="marketing__link" href="#features">
              Features
            </a>
            <a className="marketing__link" href="#pricing">
              Pricing
            </a>
            <a className="marketing__link" href="#how">
              How it works
            </a>
            <a className="marketing__link" href={CONTACT_HREF}>
              Get a website
            </a>
            <button className="btn marketing__signin" onClick={onSignIn}>
              Sign in
            </button>
          </nav>
        </div>
      </header>

      <section className="marketing__hero">
        <div className="marketing__hero-in">
          <span className="marketing__eyebrow">Booking & scheduling for local shops</span>
          <h1 className="marketing__h1">Let clients book you online — without the front-desk busywork.</h1>
          <p className="marketing__lead">
            StoreCal gives your salon, barbershop, or studio a clean booking calendar, staff
            scheduling, store hours, and a client list — plus a booking widget you can drop onto any
            website.
          </p>
          <div className="marketing__cta">
            <button className="btn marketing__cta-primary" onClick={onDemo}>
              Try the live demo →
            </button>
            <button className="marketing__cta-ghost linklike" onClick={onSignIn}>
              Sign in
            </button>
          </div>
          <p className="marketing__demonote">
            The demo signs you into a sample store as the owner — explore the calendar, team, and
            hours. It resets periodically.
            <a href="/demo.html" target="_blank" rel="noreferrer">
              {" "}
              Or see the customer booking widget →
            </a>
          </p>
        </div>

        {/* Simple app mock for visual interest */}
        <div className="marketing__art" aria-hidden="true">
          <div className="marketing__art-card">
            <div className="marketing__art-head">
              <span className="marketing__art-dot" />
              <span className="marketing__art-dot" />
              <span className="marketing__art-dot" />
            </div>
            <div className="marketing__art-body">
              <div className="marketing__art-col">
                <span>Mon</span>
                <i className="marketing__art-evt" style={{ top: 8, height: 34 }} />
                <i className="marketing__art-evt marketing__art-evt--b" style={{ top: 62, height: 26 }} />
              </div>
              <div className="marketing__art-col">
                <span>Tue</span>
                <i className="marketing__art-evt marketing__art-evt--b" style={{ top: 20, height: 28 }} />
              </div>
              <div className="marketing__art-col">
                <span>Wed</span>
                <i className="marketing__art-evt" style={{ top: 40, height: 40 }} />
              </div>
              <div className="marketing__art-col">
                <span>Thu</span>
                <i className="marketing__art-evt marketing__art-evt--b" style={{ top: 10, height: 24 }} />
                <i className="marketing__art-evt" style={{ top: 54, height: 30 }} />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="marketing__section" id="features">
        <h2 className="marketing__h2">Everything to run the front desk</h2>
        <div className="marketing__grid">
          {MARKETING_FEATURES.map((f) => (
            <div className="marketing__card" key={f.t}>
              <span className="marketing__ficon">
                <Icon name={f.icon} />
              </span>
              <h3 className="marketing__ct">{f.t}</h3>
              <p className="marketing__cd">{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="marketing__section" id="how">
        <h2 className="marketing__h2">Up and running in minutes</h2>
        <div className="marketing__steps">
          {[
            { n: 1, t: "Set your hours & team", d: "Add your staff, services, and store hours." },
            {
              n: 2,
              t: "Add the booking widget",
              d: "Paste one line onto your site and clients book instantly.",
            },
            {
              n: 3,
              t: "Manage from one calendar",
              d: "Every booking lands in your calendar — online, phone, or walk-in.",
            },
          ].map((s) => (
            <div className="marketing__step" key={s.n}>
              <span className="marketing__num">{s.n}</span>
              <h3 className="marketing__ct">{s.t}</h3>
              <p className="marketing__cd">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="marketing__section" id="pricing">
        <h2 className="marketing__h2">Simple monthly pricing</h2>
        <p className="marketing__sub">No contracts — cancel anytime. Billed monthly.</p>
        <div className="marketing__plans">
          {MARKETING_PLANS.map((p) => (
            <div className={"marketing__plan" + (p.featured ? " marketing__plan--featured" : "")} key={p.name}>
              {p.featured && <span className="marketing__plan-tag">Most popular</span>}
              <h3 className="marketing__plan-name">{p.name}</h3>
              <div className="marketing__plan-price">
                {p.price}
                <span className="marketing__plan-per">{p.per}</span>
              </div>
              <p className="marketing__plan-blurb">{p.blurb}</p>
              <ul className="marketing__plan-points">
                {p.points.map((pt) => (
                  <li key={pt}>{pt}</li>
                ))}
              </ul>
              <button className="btn marketing__plan-cta" onClick={() => openApply(p.name)}>
                Get started
              </button>
            </div>
          ))}
        </div>
        <p className="marketing__sub marketing__sub--fine">
          Prices in USD. Subscription renews monthly until cancelled; all payments are final. See our{" "}
          <button className="linklike" onClick={() => onLegal("refunds")}>
            refund &amp; cancellation policy
          </button>
          .
        </p>
      </section>

      <section className="marketing__section" id="contact">
        <div className="marketing__contact">
          <h2 className="marketing__contact-h">Need a website to go with it?</h2>
          <p className="marketing__contact-p">
            I design and build custom websites for local businesses — with StoreCal booking built
            right in.
          </p>
          <button className="btn marketing__contact-btn" onClick={() => openApply("")}>
            Apply for a website
          </button>
          <p className="marketing__contact-sub">
            Questions? Email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
          </p>
        </div>
      </section>

      <footer className="marketing__foot">
        <a className="marketing__brand" href="#top">
          <span className="brand__mark">
            <BrandLogo />
          </span>
          <span className="brand__name">StoreCal</span>
        </a>
        <span className="marketing__foot-links">
          <a className="marketing__link" href="#pricing">
            Pricing
          </a>
          <button className="linklike marketing__link" onClick={() => onLegal("terms")}>
            Terms
          </button>
          <button className="linklike marketing__link" onClick={() => onLegal("privacy")}>
            Privacy
          </button>
          <button className="linklike marketing__link" onClick={() => onLegal("refunds")}>
            Refunds &amp; Cancellations
          </button>
        </span>
      </footer>

      {applyOpen && <ApplyForWebsiteModal plan={applyPlan} onClose={() => setApplyOpen(false)} />}
    </div>
  );
}
