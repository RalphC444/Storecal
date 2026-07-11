import { useState, useEffect, useRef } from "react";
import { Icon } from "../../components/Icon";
import { BrandLogo } from "../../components/BrandLogo";
import { ApplyForWebsiteModal } from "./ApplyForWebsiteModal";
import { CONTACT_HREF, SUPPORT_EMAIL, MARKETING_FEATURES, MARKETING_PLANS } from "./constants";

// The public marketing landing page shown before sign-in. Editorial layout —
// serif display type, soft blobs, a scrolling marquee, floating glyphs, and
// scroll-in reveals — dressed in StoreCal's navy + periwinkle branding. Our own
// site has to look like the best site we'd build for a client, so it doubles as
// a portfolio piece.
export function LandingPage({ onSignIn, onDemo, onLegal }) {
  const [applyOpen, setApplyOpen] = useState(false);
  const [applyPlan, setApplyPlan] = useState("");
  const [navOpen, setNavOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const rootRef = useRef(null);

  const openApply = (plan) => {
    setApplyPlan(plan || "");
    setApplyOpen(true);
    setNavOpen(false);
  };

  // Sticky-nav background on scroll + one-shot reveal for anything [data-reveal].
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 18);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    // Gate the reveal animation on JS being alive: only now do we allow the
    // hidden start-state, so a no-JS / observer-less visitor still sees content.
    if (rootRef.current) rootRef.current.classList.add("reveal-ready");
    const els = rootRef.current ? rootRef.current.querySelectorAll("[data-reveal]") : [];
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("is-in");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.14, rootMargin: "0px 0px -8% 0px" }
    );
    els.forEach((el) => io.observe(el));

    return () => {
      window.removeEventListener("scroll", onScroll);
      io.disconnect();
    };
  }, []);

  const closeNav = () => setNavOpen(false);

  return (
    <div className="marketing" id="top" ref={rootRef}>
      <div className="marketing__grain" aria-hidden="true" />

      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <header className={"marketing__nav" + (scrolled ? " is-scrolled" : "") + (navOpen ? " is-open" : "")}>
        <div className="marketing__navwrap">
          <a className="marketing__brand" href="#top" onClick={closeNav}>
            <span className="brand__mark"><BrandLogo /></span>
            <span className="marketing__brandname">StoreCal</span>
          </a>
          <nav className="marketing__links" aria-label="Primary">
            <a className="marketing__link" href="#features" onClick={closeNav}>Features</a>
            <a className="marketing__link" href="#how" onClick={closeNav}>How it works</a>
            <a className="marketing__link" href="#pricing" onClick={closeNav}>Pricing</a>
            <a className="marketing__link" href="#website" onClick={closeNav}>Get a website</a>
            <button className="mbtn mbtn--nav" onClick={() => { closeNav(); onSignIn(); }}>Sign in</button>
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

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section className="marketing__hero" id="hero">
        <div className="marketing__blob marketing__blob--1" aria-hidden="true" />
        <div className="marketing__blob marketing__blob--2" aria-hidden="true" />
        <div className="marketing__blob marketing__blob--3" aria-hidden="true" />

        <div className="marketing__heroin">
          <div className="marketing__herocopy">
            <p className="marketing__eyebrow" data-reveal>
              <span className="marketing__pill">✦ Booking &amp; scheduling for local shops</span>
            </p>
            <h1 className="marketing__h1" data-reveal>
              Let clients book you online —<br />
              without the <em>front-desk busywork.</em>
            </h1>
            <p className="marketing__lead" data-reveal>
              StoreCal gives your salon, barbershop, or studio a clean booking calendar, staff
              scheduling, store hours, and a client list — plus a booking widget you can drop onto
              <em> any website</em> in one line.
            </p>
            <div className="marketing__cta" data-reveal>
              <button className="mbtn mbtn--primary" onClick={onDemo}>Try the live demo →</button>
              <button className="mbtn mbtn--ghost" onClick={onSignIn}>Sign in</button>
            </div>
            <p className="marketing__demonote" data-reveal>
              The demo signs you into a sample store as the owner — explore the calendar, team, and
              hours. It resets periodically.{" "}
              <a href="/demo.html" target="_blank" rel="noreferrer">Or see the customer booking widget →</a>
            </p>
          </div>

          {/* Hero visual — the live-calendar mock, framed and floating. */}
          <div className="marketing__herovisual" data-reveal>
            <div className="marketing__mock">
              <div className="marketing__mock-head">
                <span className="marketing__mock-dot" />
                <span className="marketing__mock-dot" />
                <span className="marketing__mock-dot" />
              </div>
              <div className="marketing__mock-body">
                <div className="marketing__mock-col">
                  <span>Mon</span>
                  <i className="marketing__mock-evt" style={{ top: 8, height: 34 }} />
                  <i className="marketing__mock-evt marketing__mock-evt--b" style={{ top: 62, height: 26 }} />
                </div>
                <div className="marketing__mock-col">
                  <span>Tue</span>
                  <i className="marketing__mock-evt marketing__mock-evt--b" style={{ top: 20, height: 28 }} />
                </div>
                <div className="marketing__mock-col">
                  <span>Wed</span>
                  <i className="marketing__mock-evt" style={{ top: 40, height: 40 }} />
                </div>
                <div className="marketing__mock-col">
                  <span>Thu</span>
                  <i className="marketing__mock-evt marketing__mock-evt--b" style={{ top: 10, height: 24 }} />
                  <i className="marketing__mock-evt" style={{ top: 54, height: 30 }} />
                </div>
              </div>
            </div>
            <div className="marketing__badge">✦<span>Live calendar</span></div>
            <span className="marketing__floatie marketing__floatie--h1" aria-hidden="true">📅</span>
            <span className="marketing__floatie marketing__floatie--h2" aria-hidden="true">✦</span>
          </div>
        </div>
      </section>

      {/* ── Marquee ─────────────────────────────────────────────────────── */}
      <div className="marketing__marquee" aria-hidden="true">
        <div className="marketing__marquee-track">
          <span>Online booking ✦ Staff calendars ✦ Store hours ✦ Client list ✦ One-line embed ✦ Built for local shops ✦&nbsp;</span>
          <span>Online booking ✦ Staff calendars ✦ Store hours ✦ Client list ✦ One-line embed ✦ Built for local shops ✦&nbsp;</span>
        </div>
      </div>

      {/* ── Features ────────────────────────────────────────────────────── */}
      <section className="marketing__section" id="features">
        <span className="marketing__floatie marketing__floatie--s1" aria-hidden="true">✦</span>
        <div className="marketing__sechead">
          <p className="marketing__section-eyebrow" data-reveal>What you get</p>
          <h2 className="marketing__h2" data-reveal>Everything to run the <em>front desk.</em></h2>
          <p className="marketing__lede" data-reveal>
            One place for bookings, staff, hours, and clients — so the phone stops being your
            calendar.
          </p>
        </div>
        <div className="marketing__grid">
          {MARKETING_FEATURES.map((f, i) => (
            <div className={"marketing__card" + (i === 0 ? " marketing__card--feature" : "")} key={f.t} data-reveal>
              <span className="marketing__cardicon"><Icon name={f.icon} /></span>
              <h3 className="marketing__ct">{f.t}</h3>
              <p className="marketing__cd">{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ────────────────────────────────────────────────── */}
      <section className="marketing__section marketing__section--tint" id="how">
        <div className="marketing__sechead">
          <p className="marketing__section-eyebrow" data-reveal>Up and running in minutes</p>
          <h2 className="marketing__h2" data-reveal>Three steps to <em>booked.</em></h2>
        </div>
        <div className="marketing__steps">
          {[
            { n: 1, t: "Set your hours & team", d: "Add your staff, services, and store hours." },
            { n: 2, t: "Add the booking widget", d: "Paste one line onto your site and clients book instantly." },
            { n: 3, t: "Manage from one calendar", d: "Every booking lands in your calendar — online, phone, or walk-in." },
          ].map((s) => (
            <div className="marketing__step" key={s.n} data-reveal>
              <span className="marketing__num">{s.n}</span>
              <h3 className="marketing__ct">{s.t}</h3>
              <p className="marketing__cd">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Pricing ─────────────────────────────────────────────────────── */}
      <section className="marketing__section" id="pricing">
        <span className="marketing__floatie marketing__floatie--p1" aria-hidden="true">✦</span>
        <div className="marketing__sechead">
          <p className="marketing__section-eyebrow" data-reveal>Pricing</p>
          <h2 className="marketing__h2" data-reveal>Simple <em>monthly</em> pricing.</h2>
          <p className="marketing__lede" data-reveal>No contracts — cancel anytime. Billed monthly.</p>
        </div>
        <div className="marketing__plans">
          {MARKETING_PLANS.map((p) => (
            <div className={"marketing__plan" + (p.featured ? " marketing__plan--featured" : "")} key={p.name} data-reveal>
              {p.featured && <span className="marketing__plantag">Most popular</span>}
              <h3 className="marketing__planname">{p.name}</h3>
              <div className="marketing__planprice">
                {p.price}<span className="marketing__planper">{p.per}</span>
              </div>
              <p className="marketing__planblurb">{p.blurb}</p>
              <ul className="marketing__planpoints">
                {p.points.map((pt) => <li key={pt}>{pt}</li>)}
              </ul>
              <button className={"mbtn " + (p.featured ? "mbtn--primary" : "mbtn--ghost") + " marketing__plancta"} onClick={() => openApply(p.name)}>
                Get started
              </button>
            </div>
          ))}
        </div>
        <p className="marketing__fine">
          Prices in USD. Subscription renews monthly until cancelled; all payments are final. See our{" "}
          <button className="linklike marketing__finelink" onClick={() => onLegal("refunds")}>refund &amp; cancellation policy</button>.
        </p>
      </section>

      {/* ── Get-a-website CTA band ──────────────────────────────────────── */}
      <section className="marketing__band" id="website">
        <div className="marketing__blob marketing__blob--band" aria-hidden="true" />
        <span className="marketing__floatie marketing__floatie--b1" aria-hidden="true">✦</span>
        <div className="marketing__band-in">
          <p className="marketing__section-eyebrow marketing__section-eyebrow--on-dark" data-reveal>Done for you</p>
          <h2 className="marketing__h2 marketing__h2--on-dark" data-reveal>Need a <em>website</em> to go with it?</h2>
          <p className="marketing__band-lede" data-reveal>
            We design and build custom websites for local businesses — with StoreCal booking built
            right in, and your services and staff synced live.
          </p>
          <div className="marketing__band-cta" data-reveal>
            <button className="mbtn mbtn--primary mbtn--lg" onClick={() => openApply("")}>✦ Apply for a website</button>
            <a className="mbtn mbtn--ghost mbtn--on-dark" href={CONTACT_HREF}>Email us</a>
          </div>
          <p className="marketing__band-sub" data-reveal>
            Questions? Email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
          </p>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="marketing__foot">
        <div className="marketing__foot-grid">
          <div className="marketing__foot-brand">
            <a className="marketing__brand" href="#top">
              <span className="brand__mark"><BrandLogo /></span>
              <span className="marketing__brandname marketing__brandname--foot">StoreCal</span>
            </a>
            <p>Booking, scheduling, and websites for local shops.</p>
          </div>
          <div className="marketing__foot-col">
            <h4>Product</h4>
            <a href="#features">Features</a>
            <a href="#pricing">Pricing</a>
            <a href="#how">How it works</a>
          </div>
          <div className="marketing__foot-col">
            <h4>Company</h4>
            <a href="#website">Get a website</a>
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
          <span>Made with ✦ for small shops</span>
        </div>
      </footer>

      {applyOpen && <ApplyForWebsiteModal plan={applyPlan} onClose={() => setApplyOpen(false)} />}
    </div>
  );
}
