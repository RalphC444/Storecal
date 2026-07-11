import { useEffect } from "react";
import { SUPPORT_EMAIL } from "./constants";

// Public policy pages — required for Stripe account activation (refund/dispute,
// cancellation) plus standard Terms & Privacy. Reachable without a login.
export function PolicyPages({ section, onBack }) {
  useEffect(() => {
    const el = section && document.getElementById("lgl-" + section);
    if (el) el.scrollIntoView({ block: "start" });
  }, [section]);
  return (
    <div className="legal">
      <header className="legal__nav">
        <button className="linklike legal__back" onClick={onBack}>
          ← Back to StoreCal
        </button>
      </header>
      <div className="legal__body">
        <h1 className="legal__title">StoreCal — Policies</h1>
        <p className="legal__meta">
          StoreCal · Booking &amp; scheduling software for local businesses.
          <br />
          Support &amp; billing questions: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
        </p>

        <section id="lgl-terms" className="legal__sec">
          <h2>Terms of Service</h2>
          <p>
            StoreCal provides online booking and scheduling software on a monthly subscription. By
            creating an account or subscribing you agree to these terms. You are responsible for the
            accuracy of the business information, services, staff, and hours you publish, and for how
            you use client contact details you collect.
          </p>
          <p>
            Subscriptions are billed monthly in advance through our payment processor, Stripe. Your
            plan renews automatically each month until you cancel. We may update features or these
            terms; material changes will be reflected on this page. We may suspend accounts that
            misuse the service or fail payment.
          </p>
        </section>

        <section id="lgl-refunds" className="legal__sec">
          <h2>Refund &amp; Dispute Policy</h2>
          <p>
            StoreCal is a monthly software subscription billed in advance.{" "}
            <b>All payments are final and non-refundable</b>, including for unused time in a billing
            period. You can cancel at any time to stop future charges (see the Cancellation Policy
            below) — cancelling prevents your next renewal but does not refund the current period.
          </p>
          <p>
            If you believe you were charged in error, email us at{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> before opening a dispute and we’ll
            look into it promptly.
          </p>
          <h3>Cancellation Policy</h3>
          <p>
            You can cancel anytime from <b>Settings → Billing</b> in your StoreCal account, or by
            emailing <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>. Cancellation stops
            future monthly renewals; your account stays active until the end of the current billing
            period. There are no cancellation fees and no long-term contracts.
          </p>
        </section>

        <section id="lgl-privacy" className="legal__sec">
          <h2>Privacy Policy</h2>
          <p>
            We collect the account information you provide (business details, staff, services, hours)
            and the booking and client information entered into your account, in order to operate the
            service. Payment card details are handled directly by Stripe — StoreCal never stores full
            card numbers.
          </p>
          <p>
            We do not sell personal information. We share data only with the processors needed to run
            StoreCal (e.g. hosting, database, Stripe for payments, and email delivery for invites and
            password resets). To request access to or deletion of your data, email{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
          </p>
        </section>
      </div>
    </div>
  );
}
