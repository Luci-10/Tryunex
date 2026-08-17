import { useEffect, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft } from "../components/ui/icons";

/**
 * The three policy pages share one shell: contents nav, cards, spacing.
 *
 * Everything here describes what the product actually does today. Where a
 * protection is not yet implemented, the text says so rather than claiming it —
 * a policy that overstates the implementation is worse than no policy.
 */

export const LAST_UPDATED = "16 August 2026";
export const SUPPORT_EMAIL = "tryunex8@gmail.com";

type Section = { id: string; heading: string; body: ReactNode };

function LegalPage({
  title,
  intro,
  sections,
}: {
  title: string;
  intro: ReactNode;
  sections: Section[];
}) {
  // These are entry points from a footer link, so start at the top. Braces
  // matter: an arrow with an implicit return hands React the return value of
  // scrollTo as a cleanup function, which it then tries to call.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="relative min-h-full bg-canvas">
      <header className="sticky top-0 z-30 bg-canvas/85 backdrop-blur-md border-b border-ink/[0.06] pt-safe">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-3">
          <Link
            to="/"
            className="flex items-center gap-2 font-bold text-brand-700 tracking-tight tap-44"
          >
            <img src="/favicon.svg" alt="" className="w-6 h-6" />
            TryUnex
          </Link>
          <Link
            to="/"
            className="ml-auto tap-44 inline-flex items-center gap-1 text-[13.5px] font-semibold text-brand-700 hover:underline"
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 sm:py-10 space-y-6">
        <div>
          <h1 className="text-[28px] sm:text-[34px] font-bold tracking-tight leading-tight">
            {title}
          </h1>
          <p className="text-[13px] text-ink/55 mt-2">Last updated: {LAST_UPDATED}</p>
        </div>

        <div className="rounded-card border border-ink/[0.07] bg-white shadow-card p-4 sm:p-5">
          <div className="text-[14.5px] text-ink/75 leading-relaxed space-y-3">{intro}</div>
        </div>

        <nav aria-label="Contents" className="rounded-card border border-ink/[0.07] bg-lilac/45 p-4">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-brand-700">
            Contents
          </h2>
          <ol className="mt-2.5 space-y-1">
            {sections.map((s, i) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="tap-44 inline-block text-[14px] text-ink/75 hover:text-brand-700 hover:underline"
                >
                  {i + 1}. {s.heading}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        {sections.map((s, i) => (
          <section
            key={s.id}
            id={s.id}
            className="scroll-mt-20 rounded-card border border-ink/[0.07] bg-white shadow-card p-4 sm:p-5"
          >
            <h2 className="text-[18px] sm:text-[20px] font-bold tracking-tight leading-tight">
              <span className="text-brand-600">{i + 1}.</span> {s.heading}
            </h2>
            <div className="text-[14.5px] text-ink/75 leading-relaxed mt-3 space-y-3">{s.body}</div>
          </section>
        ))}

        <div className="rounded-card border border-ink/[0.07] bg-mint/40 p-4 sm:p-5">
          <h2 className="text-[16px] font-bold tracking-tight">Contact &amp; grievances</h2>
          <p className="text-[14.5px] text-ink/75 leading-relaxed mt-2">
            For privacy questions, support, or grievances, contact our Grievance Officer, Shubham
            Sheshank, at{" "}
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="font-semibold text-brand-700 hover:underline"
            >
              {SUPPORT_EMAIL}
            </a>
            .
          </p>
          <dl className="text-[14px] leading-relaxed mt-3 space-y-1">
            <div className="flex gap-2">
              <dt className="text-ink/60 shrink-0">Grievance Officer:</dt>
              <dd className="font-medium">Shubham Sheshank</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-ink/60 shrink-0">Email:</dt>
              <dd>
                <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium text-brand-700 hover:underline">
                  {SUPPORT_EMAIL}
                </a>
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-ink/60 shrink-0">Location:</dt>
              <dd className="font-medium">Mumbai, Maharashtra, India</dd>
            </div>
          </dl>
          <p className="text-[13px] text-ink/60 leading-relaxed mt-3">
            TryUnex is operated by Shubham Sheshank as an individual proprietor under the TryUnex
            brand.
          </p>
        </div>

        <nav aria-label="Other policies" className="flex flex-wrap gap-x-4 gap-y-2 justify-center pb-4">
          {[
            { to: "/privacy", label: "Privacy Policy" },
            { to: "/terms", label: "Terms of Service" },
            { to: "/refunds", label: "Refund & Credit Policy" },
          ].map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="tap-44 text-[13px] text-ink/60 hover:text-brand-700 hover:underline"
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </main>
    </div>
  );
}

/** Marks a protection that is stated honestly because it is not yet built. */
function Gap({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl bg-butter/60 border border-amber-600/15 px-3.5 py-2.5 text-[13.5px] leading-relaxed">
      {children}
    </p>
  );
}

function L({ children }: { children: ReactNode }) {
  return <li className="ml-4 list-disc marker:text-ink/35">{children}</li>;
}

function Mail() {
  return (
    <a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold text-brand-700 hover:underline">
      {SUPPORT_EMAIL}
    </a>
  );
}

/* ------------------------------------------------------------- privacy */

export function Privacy() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro={
        <>
          <p>
            This policy explains what TryUnex collects, why, who it is shared with, and what you can
            ask us to do about it. It describes how the service works today. Where a protection is
            not yet in place, we say so rather than implying otherwise.
          </p>
        </>
      }
      sections={[
        {
          id: "collect",
          heading: "What we collect",
          body: (
            <>
              <ul className="space-y-1.5">
                <L>
                  <strong className="text-ink">Account:</strong> your name, email address, and the
                  one-time codes used to sign you in. We also collect your date of birth, which is
                  required at signup and used to confirm you meet the minimum age for an account.
                  Gender is optional.
                </L>
                <L>
                  <strong className="text-ink">Wardrobe:</strong> the photos you upload and the
                  details attached to them — name, category, style tag, status, and when items were
                  worn or planned.
                </L>
                <L>
                  <strong className="text-ink">Try-on:</strong> the photo of yourself you upload, the
                  garment images used, which items you selected, the settings for each request, the
                  generated result, and your try-on history.
                </L>
                <L>
                  <strong className="text-ink">AI stylist chat:</strong> the messages you send and
                  the wardrobe information deliberately included so the assistant can answer.
                </L>
                <L>
                  <strong className="text-ink">Thrift:</strong> listings you create — photo, title,
                  price, size, condition, description, and city if you supply one — plus saved items,
                  reports you make, and messages within a listing conversation.
                </L>
                <L>
                  <strong className="text-ink">Billing:</strong> your plan, credit balance and
                  ledger, payment status, and the payment or order reference returned by our payment
                  processor.
                </L>
                <L>
                  <strong className="text-ink">Consent:</strong> which version of these policies you
                  accepted, and when.
                </L>
                <L>
                  <strong className="text-ink">Technical and security:</strong> session data,
                  timestamps, error logs, and records kept to detect abuse and rate-limit misuse.
                </L>
              </ul>
              <p>
                <strong className="text-ink">
                  We do not store full card numbers, UPI PINs, passwords, or banking credentials.
                </strong>{" "}
                TryUnex has no password to store — sign-in uses a code sent to your email. Card and
                UPI details are entered with our payment processor and never reach our servers.
              </p>
            </>
          ),
        },
        {
          id: "why",
          heading: "Why we process it",
          body: (
            <ul className="space-y-1.5">
              <L>To create your account, sign you in, keep it secure, and answer support requests.</L>
              <L>
                To run the features you use: wardrobe organisation, outfit planning, AI try-on, AI
                chat, credits and subscriptions, and the Thrift marketplace.
              </L>
              <L>
                To verify payments, apply and restore credits, prevent fraud and abuse, fix bugs, and
                meet legal obligations.
              </L>
              <L>To understand service usage in aggregated or de-identified form where possible.</L>
            </ul>
          ),
        },
        {
          id: "ai",
          heading: "AI processing",
          body: (
            <>
              <p>
                A try-on only runs when you ask for one. We use{" "}
                <strong className="text-ink">FAL AI</strong> to generate it. When you request a look,
                the photo of yourself and the garment images for that look are sent to FAL solely to
                produce the result you asked for. We ask FAL not to retain the request or its output,
                and we copy the result into our own storage immediately.
              </p>
              <p>
                <strong className="text-ink">
                  We do not use your photos, wardrobe images, or generated results to train our own
                  AI models.
                </strong>{" "}
                We do not make claims about whether external providers store or train on data beyond
                what their own terms state; their handling is governed by their terms, not ours.
              </p>
              <p>
                We will not use your images for marketing, testimonials, or public display without
                asking you separately and getting your explicit agreement first.
              </p>
              <p>
                Generated try-ons are{" "}
                <strong className="text-ink">visual styling previews only</strong>. They are not a
                guarantee of fit, size, body measurement, colour accuracy, garment authenticity, or
                suitability for purchase.
              </p>
            </>
          ),
        },
        {
          id: "vendors",
          heading: "Service providers",
          body: (
            <>
              <p>We rely on a small number of providers to run TryUnex:</p>
              <ul className="space-y-1.5">
                <L>Neon — database hosting.</L>
                <L>Cloudflare R2 — image storage.</L>
                <L>Vercel — application hosting and infrastructure.</L>
                <L>FAL AI — virtual try-on generation.</L>
                <L>Razorpay — payment processing.</L>
                <L>An email provider — sign-in codes and support mail.</L>
              </ul>
              <p>
                Each receives only what it needs to do its job. Data may be processed in India and in
                other countries where these providers operate.{" "}
                <strong className="text-ink">We do not sell personal data.</strong>
              </p>
            </>
          ),
        },
        {
          id: "images",
          heading: "Your images",
          body: (
            <>
              <p>
                Your wardrobe photos, the photo of yourself, and your generated try-ons are private
                to your account within the app. They are not shown to other users, not listed
                publicly, and not searchable. The only images other people can see are ones you
                choose to publish as a Thrift listing, and images belonging to someone who has
                explicitly shared their wardrobe with you.
              </p>
              <Gap>
                <strong className="text-ink">Please read this before uploading anything sensitive.</strong>{" "}
                Images are stored at unique, unguessable web addresses. Those addresses are not
                currently individually access-controlled, which means anyone who obtained the exact
                address of an image could open it without signing in. We do not publish or share
                those addresses, but we want you to know the limit of the protection rather than
                overstate it. Adding access-controlled, time-limited links is a priority improvement.
              </Gap>
              <p>
                Marketplace messages are for arranging a sale. They must not be used to share
                personal contact details, payment credentials, or illegal content, and phone numbers
                and email addresses are blocked automatically.
              </p>
            </>
          ),
        },
        {
          id: "retention",
          heading: "Keeping and deleting data",
          body: (
            <>
              <p>
                Your wardrobe photos and try-on results stay until you delete them or ask us to close
                your account. Deleting an item removes it from your wardrobe and from the app
                immediately.
              </p>
              <Gap>
                Deleting an item currently removes it from your account and from view, but the
                underlying image file is not yet automatically erased from our storage provider. We
                are changing this. In the meantime, if you want a specific image permanently removed,
                email <Mail /> and we will delete it manually.
              </Gap>
              <p>
                Account closure is handled by request rather than a self-service button. Email{" "}
                <Mail /> from your registered address and we will close the account and delete your
                data within 30 days, apart from records we must keep for legal, accounting, fraud
                prevention, dispute, or security reasons.
              </p>
              <p>
                Backups may retain deleted data for a short period before they rotate out. Payment
                and transaction records are kept for as long as the law requires.
              </p>
            </>
          ),
        },
        {
          id: "rights",
          heading: "Your rights",
          body: (
            <p>
              You can ask us for a copy of your data, ask us to correct it, ask us to delete specific
              items or your whole account, withdraw consent where it applies, or raise a privacy
              concern. Write to <Mail /> from the email address on your account and we will respond.
            </p>
          ),
        },
        {
          id: "security",
          heading: "Security",
          body: (
            <p>
              We use reasonable measures to protect your data: HTTPS everywhere, signed session
              cookies, server-side access checks on every request so you can only reach your own
              data, and least-privilege credentials for our providers. No online service can promise
              absolute security, and we do not claim to. If you believe your account has been
              accessed by someone else, contact <Mail /> immediately.
            </p>
          ),
        },
      ]}
    />
  );
}

/* --------------------------------------------------------------- terms */

export function Terms() {
  return (
    <LegalPage
      title="Terms of Service"
      intro={
        <p>
          These terms apply when you use TryUnex. By creating an account or using the service you
          agree to them. TryUnex is operated by Shubham Sheshank as an individual proprietor under
          the TryUnex brand, based in Mumbai, Maharashtra, India.
        </p>
      }
      sections={[
        {
          id: "eligibility",
          heading: "Your account",
          body: (
            <>
              <p>
                You agree to give accurate information, to keep access to your email secure — it is
                how you sign in — and to tell us promptly if you think someone else has got into
                your account.
              </p>
              <p>One person, one account. Do not share your account with anyone else.</p>
            </>
          ),
        },
        {
          id: "content",
          heading: "Your content",
          body: (
            <>
              <p>
                <strong className="text-ink">You keep ownership of everything you upload.</strong>{" "}
                You give us a limited permission to host, store, process and display your content
                privately within your account, and to generate the AI results you specifically ask
                for. That permission exists only to run the service for you, and ends when you delete
                the content or your account.
              </p>
              <p>
                You must own the images you upload or have permission to use them. Do not upload a
                photo of another person without their permission.
              </p>
              <p>You must not upload or share content that is:</p>
              <ul className="space-y-1.5">
                <L>illegal, or that promotes illegal activity;</L>
                <L>infringing on someone else's copyright, trademark, or other rights;</L>
                <L>deceptive, fraudulent, or impersonating another person;</L>
                <L>sexually exploitative, or sexual content involving minors in any form;</L>
                <L>harassing, abusive, or violating someone's privacy.</L>
              </ul>
            </>
          ),
        },
        {
          id: "tryon",
          heading: "AI try-on",
          body: (
            <p>
              AI try-on produces a visual styling preview and{" "}
              <strong className="text-ink">results may be inaccurate</strong>. We make no guarantee
              about exact size, fit, colour, drape, product availability, how a garment will look on
              your body, or whether an item is authentic. Always rely on the garment's actual sizing
              information and the seller's or retailer's product details before buying anything.
            </p>
          ),
        },
        {
          id: "credits",
          heading: "Credits and subscriptions",
          body: (
            <>
              <p>Try-on runs on credits. The rules are:</p>
              <ul className="space-y-1.5">
                <L>New members receive 3 free try-on credits.</L>
                <L>Members on the free plan receive 1 free try-on credit each month.</L>
                <L>Members on the free plan can send up to 10 AI chat messages each month.</L>
                <L>A look with 1 to 3 clothing items costs 1 credit.</L>
                <L>A look with 4 or 5 clothing items costs 2 credits.</L>
                <L>More than 5 items in one look is not supported.</L>
                <L>
                  Regenerate is a fresh AI request and costs the same as the original look — 1 credit
                  for 1–3 items, 2 for 4–5.
                </L>
                <L>Opening a look you have already generated is free and costs no credit.</L>
              </ul>
              <p>
                Credits are non-transferable, cannot be resold, and have no cash value. Credits from
                a one-time pack do not expire, except where the law requires otherwise or where we
                need to act on fraud or abuse. Credits included with a monthly plan are valid for
                that billing period.
              </p>
              <p>
                <strong className="text-ink">Monthly plans renew automatically</strong> through our
                payment processor until you cancel. Cancelling stops future renewals; it does not
                shorten the period you have already paid for.
              </p>
            </>
          ),
        },
        {
          id: "thrift",
          heading: "Thrift marketplace",
          body: (
            <>
              <p>
                <strong className="text-ink">
                  TryUnex is a platform that connects buyers and sellers.
                </strong>{" "}
                We are not the seller, the shipper, an authenticator, an insurer, or the owner of any
                listed item. Buyers and sellers arrange payment and delivery directly between
                themselves, outside TryUnex.
              </p>
              <p>
                We do not provide escrow, buyer protection, authentication, delivery tracking, or
                refunds on marketplace transactions. Please take the same care you would with any
                private sale.
              </p>
              <p>If you list an item, you must describe it truthfully — photos, condition, size, and price. You must not:</p>
              <ul className="space-y-1.5">
                <L>list counterfeit or replica goods;</L>
                <L>post misleading listings or fake pricing;</L>
                <L>harass another user, or attempt a scam;</L>
                <L>ask a buyer to pay through a channel designed to avoid accountability.</L>
              </ul>
            </>
          ),
        },
        {
          id: "suspension",
          heading: "Suspension, liability, and law",
          body: (
            <>
              <p>
                We may remove content or suspend an account where we reasonably believe it is
                necessary for safety, to prevent fraud or abuse, to comply with the law, or because
                these terms have been broken. Where it is reasonable to do so, we will tell you why.
              </p>
              <p>
                TryUnex is provided as-is. To the extent permitted by law, we are not liable for
                indirect or consequential loss, for decisions you make based on an AI preview, or for
                disputes between buyers and sellers on Thrift.{" "}
                <strong className="text-ink">
                  Nothing in these terms removes rights that cannot legally be excluded
                </strong>
                , including your rights under Indian consumer law.
              </p>
              <p>
                These terms are governed by the laws of India. The courts of Mumbai, Maharashtra are
                the intended forum for disputes, subject to any consumer protection law that gives
                you the right to bring a claim elsewhere.
              </p>
              <p>
                We may update these terms. If a change is significant we will make it visible in the
                app. Questions go to <Mail />.
              </p>
            </>
          ),
        },
      ]}
    />
  );
}

/* ------------------------------------------------------------- refunds */

export function Refunds() {
  return (
    <LegalPage
      title="Refund & Credit Policy"
      intro={
        <p>
          This page explains when a purchase can be refunded and what happens when a try-on fails.
          It sits alongside the Terms of Service and does not replace your statutory rights.
        </p>
      }
      sections={[
        {
          id: "packs",
          heading: "Credit packs",
          body: (
            <>
              <p>
                A credit pack can be refunded{" "}
                <strong className="text-ink">within 7 days of purchase, if no credit from that
                purchase has been used.</strong>
              </p>
              <p>
                Once any credit from a purchase has been used, that purchase is non-refundable —
                except in the case of a duplicate payment, a payment processing error, a legal
                requirement, or a verified failure by us to provide what you paid for.
              </p>
            </>
          ),
        },
        {
          id: "subscriptions",
          heading: "Monthly plans",
          body: (
            <>
              <p>
                You can cancel a monthly plan at any time to stop it renewing. Cancelling prevents
                future charges; it does not end the period you have already paid for.
              </p>
              <p>
                The current billing period is normally non-refundable once its credits have been
                issued or used. We do not give prorated refunds for part of a month, except for a
                duplicate charge, a payment error, a legal requirement, or a verified failure to
                provide the service you purchased.
              </p>
            </>
          ),
        },
        {
          id: "failed",
          heading: "If a try-on fails",
          body: (
            <>
              <p>
                <strong className="text-ink">
                  A failed try-on should never cost you a credit.
                </strong>{" "}
                If a generation does not produce a usable result, the credit is returned to your
                balance automatically, and you will see the message "your credits haven't been used".
              </p>
              <p>
                Opening a look you have already generated is free and never costs a credit. A
                Regenerate is a new request and does cost credits, because it produces a new result.
              </p>
              <p>
                If a credit is not restored automatically, email <Mail /> from your registered
                address with the approximate date and time, and your payment or order reference if
                the issue relates to a purchase. We will check the record and correct it.
              </p>
            </>
          ),
        },
        {
          id: "how",
          heading: "How to ask for a refund",
          body: (
            <>
              <p>
                Email <Mail /> from the address on your account. Include what you bought, roughly
                when, and the payment or order reference if you have it. Approved refunds are
                returned through the original payment method, and the time to appear depends on your
                bank or provider.
              </p>
              <p className="rounded-xl bg-coral/10 border border-coral/25 px-3.5 py-2.5">
                <strong className="text-ink">We will never ask you for an OTP, a password, a UPI
                PIN, or your full card number.</strong>{" "}
                Anyone who does is not us. Do not share those with anyone claiming to be TryUnex
                support.
              </p>
            </>
          ),
        },
        {
          id: "rights",
          heading: "Your statutory rights",
          body: (
            <p>
              Nothing in this policy removes or limits rights you have under Indian consumer law. If
              you think a charge is wrong, tell us first at <Mail /> — most issues are resolved
              quickly once we can see the record.
            </p>
          ),
        },
      ]}
    />
  );
}
