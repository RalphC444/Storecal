import { useState, useEffect, useRef } from "react";
import { Icon } from "../../components/Icon";
import { BrandLogo } from "../../components/BrandLogo";
import { MarketingNav } from "./MarketingNav";
import { MarketingFooter } from "./MarketingFooter";
import { CONTACT_HREF, SUPPORT_EMAIL, MARKETING_FEATURES, MARKETING_PLANS, PRICING_FAQ } from "./constants";
import { track } from "../../lib/analytics";

// The public marketing landing page shown before sign-in. Editorial layout —
// serif display type, soft blobs, a scrolling marquee, floating glyphs, and
// scroll-in reveals — dressed in StoreCal's navy + periwinkle branding. Our own
// site has to look like the best site we'd build for a client, so it doubles as
// a portfolio piece.
export function LandingPage({ nav, onGetStarted, onDemo, onLegal, openApply }) {
  const rootRef = useRef(null);
  const demoFrameRef = useRef(null);

  useEffect(() => { track("landing_view"); }, []); // top-of-funnel

  // One-shot reveal for anything [data-reveal] + auto-open the demo booking modal.
  useEffect(() => {
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

    // Auto-open the demo booking modal ~2s after the demo iframe scrolls into
    // view, so visitors see the actual flow without having to click. Fires once.
    let demoTimer = null;
    let demoFired = false;
    const demoFrame = demoFrameRef.current;
    const demoIo = demoFrame
      ? new IntersectionObserver(
          (entries) => {
            entries.forEach((e) => {
              if (e.isIntersecting && !demoFired) {
                demoTimer = setTimeout(() => {
                  demoFired = true;
                  try {
                    demoFrame.contentWindow.postMessage("storecal:autoopen", window.location.origin);
                  } catch { /* cross-origin / not ready — ignore */ }
                  demoIo.disconnect();
                }, 2000);
              } else if (!e.isIntersecting && demoTimer) {
                clearTimeout(demoTimer);
                demoTimer = null;
              }
            });
          },
          { threshold: 0.55 }
        )
      : null;
    if (demoIo && demoFrame) demoIo.observe(demoFrame);

    return () => {
      io.disconnect();
      if (demoTimer) clearTimeout(demoTimer);
      if (demoIo) demoIo.disconnect();
    };
  }, []);

  return (
    <div className="marketing" id="top" ref={rootRef}>
      <div className="marketing__grain" aria-hidden="true" />

      <MarketingNav {...nav} />

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section className="marketing__hero" id="hero">
        <div className="marketing__blob marketing__blob--1" aria-hidden="true" />
        <div className="marketing__blob marketing__blob--2" aria-hidden="true" />
        <div className="marketing__blob marketing__blob--3" aria-hidden="true" />

        <div className="marketing__heroin">
          <div className="marketing__herocopy">
            <p className="marketing__eyebrow" data-reveal>
              <span className="marketing__pill"><i className="marketing__pill-dot" aria-hidden="true" /> Booking &amp; scheduling for local shops · Westchester, NY</span>
            </p>
            <h1 className="marketing__h1" data-reveal>
              Let clients book you online, <em>no busywork.</em>
            </h1>
            <p className="marketing__lead" data-reveal>
              A clean calendar, staff scheduling, and store hours — plus a booking widget you drop
              onto any website.
            </p>
            <div className="marketing__cta" data-reveal>
              <button className="mbtn mbtn--primary" onClick={onGetStarted}>Start free →</button>
              <button className="mbtn mbtn--ghost" onClick={onDemo }>Try the live demo →</button>
            </div>
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
            <div className="marketing__badge"><i className="marketing__badge-dot" aria-hidden="true" /><span>Live calendar</span></div>
          </div>
        </div>
      </section>

      {/* ── See it live (iframed booking widget) — 2nd so prospects can try it fast ── */}
      <section className="marketing__section" id="demo">
        <div className="marketing__sechead">
          <p className="marketing__section-eyebrow" data-reveal>See it live</p>
          <h2 className="marketing__h2" data-reveal>Try the <em>actual</em> booking widget.</h2>
          <p className="marketing__lede" data-reveal>
            This is a real StoreCal widget on a sample shop's site — the same one your customers use.
            Pick a service and book a slot; it's fully interactive.
          </p>
        </div>
        <div className="marketing__browser" data-reveal>
          <div className="marketing__browser-bar">
            <span className="marketing__browser-dots"><i /><i /><i /></span>
            <span className="marketing__browser-url">demonailsalon.com</span>
          </div>
          <iframe
            ref={demoFrameRef}
            className="marketing__demo-frame"
            src="/book/demo"
            title="Live StoreCal booking page — Demo Nail Salon"
            loading="lazy"
          />
        </div>
        <p className="marketing__demo-note" data-reveal>
          Prefer the owner's view? <button className="linklike marketing__finelink" onClick={onDemo}>Try the live demo dashboard →</button>
        </p>
      </section>

      {/* ── Free booking page (lead capture for barbershops/salons) — 3rd ── */}
      <section className="marketing__section" id="free-page">
        <div className="marketing__sechead">
          <p className="marketing__section-eyebrow" data-reveal>Barbershops &amp; salons</p>
          <h2 className="marketing__h2" data-reveal>Get your <em>free booking page.</em></h2>
          <p className="marketing__lede" data-reveal>We build it for you — live in your Instagram bio in a day. Pay nothing until it books you 3 real clients.</p>
        </div>
        <FreeBookingForm />
      </section>

      {/* ── Marquee ───────────────────────────────────────────── HIDDEN ON PURPOSE FOR NOW
      <div className="marketing__marquee" aria-hidden="true">
        <div className="marketing__marquee-track">
          <span>Online booking ✦ Staff calendars ✦ Store hours ✦ Client list ✦ One-line embed ✦ Built for local shops ✦&nbsp;</span>
          <span>Online booking ✦ Staff calendars ✦ Store hours ✦ Client list ✦ One-line embed ✦ Built for local shops ✦&nbsp;</span>
        </div>
      </div>────────── 
      
      
      <ul className="marketing__chips" data-reveal>
              <li className="marketing__chip"><span className="marketing__chip-ic">⚡</span> Set up in minutes</li>
              <li className="marketing__chip"><span className="marketing__chip-ic">🔗</span> One-line embed</li>
              <li className="marketing__chip"><span className="marketing__chip-ic">✓</span> No app to download</li>
            </ul>
            */}

      {/* Features + How-it-works now live on their own page (ProductPage). */}

      {/* ── What the customer sees ──────────────────────────────────────── */}
      <section className="marketing__section marketing__section--tint" id="experience">
        <div className="marketing__sechead">
          <p className="marketing__section-eyebrow" data-reveal>The customer's side</p>
          <h2 className="marketing__h2" data-reveal>Your clients get <em>looked after.</em></h2>
          <p className="marketing__lede" data-reveal>
            Every booking and cancellation sends a clean, branded email — automatically. Nothing to
            download, nothing for you to send. This is exactly what lands in their inbox.
          </p>
        </div>
        <div className="marketing__shots">
          <figure className="marketing__shot marketing__shot--a" data-reveal>
            <div className="marketing__shot-frame">
              <img src="/booking-confirmed.png" alt="Booking confirmation email a customer receives, showing the service, time, and staff member" loading="lazy" />
            </div>
            <figcaption>
              <span className="marketing__shot-tag">When they book</span>
              A confirmation with the service, time, and who they're seeing.
            </figcaption>
          </figure>
          <figure className="marketing__shot marketing__shot--b" data-reveal>
            <div className="marketing__shot-frame">
              <img src="/booking-cancelled.png" alt="Cancellation email a customer receives, including a personal note from the shop" loading="lazy" />
            </div>
            <figcaption>
              <span className="marketing__shot-tag">If plans change</span>
              A cancellation notice — with a personal note from you.
            </figcaption>
          </figure>
        </div>
      </section>

      {/* ── Get-a-website CTA band ──────────────────────────────────────── */}
      <section className="marketing__band" id="website">
        <div className="marketing__blob marketing__blob--band" aria-hidden="true" />
        <div className="marketing__band-in">
          <p className="marketing__section-eyebrow marketing__section-eyebrow--on-dark" data-reveal>Done for you</p>
          <h2 className="marketing__h2 marketing__h2--on-dark" data-reveal>Need a <em>website</em> to go with it?</h2>
          <p className="marketing__band-lede" data-reveal>
            We design and build custom websites for local businesses — with StoreCal booking built
            right in, and your services and staff synced live.
          </p>
          <div className="marketing__band-cta" data-reveal>
            <button className="mbtn mbtn--primary mbtn--lg" onClick={() => openApply("")}>Apply for a website →</button>
            <a className="mbtn mbtn--ghost mbtn--on-dark" href={CONTACT_HREF}>Email us</a>
          </div>
          <p className="marketing__band-sub" data-reveal>
            Questions? Email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
          </p>
        </div>
      </section>

      <MarketingFooter nav={nav} onLegal={onLegal} />
    </div>
  );
}

// "Get your free booking page" — lightweight inbound lead form. Posts to
// /api/lead, which drops the shop into the Outreach CRM pipeline.
function FreeBookingForm() {
  const [form, setForm] = useState({ businessName: "", contact: "", city: "" });
  const [status, setStatus] = useState("idle"); // idle | busy | done
  const [err, setErr] = useState("");
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e) {
    e.preventDefault();
    setErr("");
    if (!form.businessName.trim() || !form.contact.trim()) {
      setErr("Add your shop name and a way to reach you.");
      return;
    }
    setStatus("busy");
    try {
      const res = await fetch("/api/lead", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || "Something went wrong — try again."); }
      setStatus("done");
    } catch (e2) { setErr(e2.message); setStatus("idle"); }
  }

  if (status === "done") {
    return (
      <div className="freepage__done" data-reveal>
        Got it 💈 — we&rsquo;ll reach out to set up your free booking page. Talk soon!
      </div>
    );
  }
  return (
    <form className="freepage__form" onSubmit={submit} data-reveal>
      <input className="freepage__input" type="text" value={form.businessName} onChange={(e) => set("businessName", e.target.value)} placeholder="Shop name" required />
      <input className="freepage__input" type="text" value={form.contact} onChange={(e) => set("contact", e.target.value)} placeholder="Phone, email, or @instagram" required />
      <input className="freepage__input" type="text" value={form.city} onChange={(e) => set("city", e.target.value)} placeholder="Town (optional)" />
      <button className="mbtn mbtn--primary freepage__btn" type="submit" disabled={status === "busy"}>
        {status === "busy" ? "Sending…" : "Get my free page →"}
      </button>
      {err && <p className="freepage__err">{err}</p>}
    </form>
  );
}
