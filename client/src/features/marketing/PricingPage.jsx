import { useEffect } from "react";
import { MARKETING_PLANS, PRICING_FAQ } from "./constants";
import { MarketingNav } from "./MarketingNav";
import { MarketingFooter } from "./MarketingFooter";

// Standalone pricing page — plans + FAQ, moved off the landing page onto their
// own route. Shares the site nav + footer.
export function PricingPage({ nav, onLegal, onGetStarted, openApply }) {
  useEffect(() => { window.scrollTo(0, 0); }, []);

  return (
    <div className="marketing pricingpage">
      <MarketingNav {...nav} />

      <main className="pricingpage__body">
        <section className="marketing__section" id="pricing">
          <div className="marketing__sechead">
            <p className="marketing__section-eyebrow">Pricing</p>
            <h2 className="marketing__h2">Simple <em>monthly</em> pricing.</h2>
            <p className="marketing__lede">First month free when you subscribe, then billed monthly. Cancel anytime.</p>
          </div>
          <div className="marketing__plans">
            {MARKETING_PLANS.map((p) => (
              <div className={"marketing__plan" + (p.featured ? " marketing__plan--featured" : "")} key={p.name}>
                {p.featured && <span className="marketing__plantag">Most popular</span>}
                <h3 className="marketing__planname">{p.name}</h3>
                <div className="marketing__planprice">
                  {p.price}<span className="marketing__planper">{p.per}</span>
                </div>
                <p className="marketing__planblurb">{p.blurb}</p>
                <ul className="marketing__planpoints">
                  {p.points.map((pt) => <li key={pt}>{pt}</li>)}
                </ul>
                <button className={"mbtn " + (p.featured ? "mbtn--primary" : "mbtn--ghost") + " marketing__plancta"}
                  onClick={() => p.featured ? openApply(p.name) : onGetStarted()}>
                  {p.featured ? "Apply for a website →" : "Start free →"}
                </button>
                {p.note && <p className="marketing__planfine">{p.note}</p>}
              </div>
            ))}
          </div>
          <div className="marketing__faq">
            {PRICING_FAQ.map((f) => (
              <div className="marketing__faq-item" key={f.q}>
                <h3 className="marketing__faq-q">{f.q}</h3>
                <p className="marketing__faq-a">{f.a}</p>
              </div>
            ))}
          </div>
          <p className="marketing__fine">
            Prices in USD. Subscription renews monthly until cancelled; all payments are final. See our{" "}
            <button className="linklike marketing__finelink" onClick={() => onLegal("refunds")}>refund &amp; cancellation policy</button>.
          </p>
        </section>
      </main>

      <MarketingFooter nav={nav} onLegal={onLegal} />
    </div>
  );
}
