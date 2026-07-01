"use client";

import { useState } from "react";
import Link from "next/link";

const CARRIERS = [
  { value: "", label: "— Prefer not to say —" },
  { value: "att", label: "AT&T / BellSouth" },
  { value: "boost", label: "Boost Mobile" },
  { value: "consumercellular", label: "Consumer Cellular" },
  { value: "cricket", label: "Cricket" },
  { value: "googlefi", label: "Google Fi" },
  { value: "metro", label: "Metro by T-Mobile" },
  { value: "mint", label: "Mint Mobile" },
  { value: "sprint", label: "Sprint" },
  { value: "tmobile", label: "T-Mobile" },
  { value: "uscellular", label: "US Cellular" },
  { value: "verizon", label: "Verizon" },
  { value: "visible", label: "Visible" },
  { value: "xfinity", label: "Xfinity Mobile" },
  { value: "other", label: "Other" },
];

// Frozen at submission time so we have per-submission audit evidence
// of what the user actually saw when they checked the consent box.
// If the copy on this page changes later, past submissions still
// carry the exact wording they agreed to.
const CONSENT_TEXT = `I agree to receive SMS text messages from Brooklake Country Club — Tennis Program at the mobile number I provided. Messages are game-schedule and program-related (reminders, cancellations, court changes, seasonal updates). Message frequency varies but typically runs 2–5 messages per week during the tennis season. Message and data rates may apply. Reply STOP to unsubscribe at any time; reply HELP for help. Consent to receive text messages is not a condition of joining the tennis program — I can also request email-only communication. See the SMS Terms & Privacy page for full details.`;

interface FormState {
  firstName: string;
  lastName: string;
  cellNumber: string;
  carrier: string;
  email: string;
  notes: string;
  consent: boolean;
}

const empty: FormState = {
  firstName: "",
  lastName: "",
  cellNumber: "",
  carrier: "",
  email: "",
  notes: "",
  consent: false,
};

export default function JoinPage() {
  const [form, setForm] = useState<FormState>(empty);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!form.firstName.trim() || !form.lastName.trim()) {
      setError("Please enter your first and last name.");
      return;
    }
    if (!form.cellNumber.trim() && !form.email.trim()) {
      setError("Please provide either a cell number or an email address so we can contact you.");
      return;
    }
    if (!form.consent) {
      setError("Please check the consent box to submit the form.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/public/signup-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: form.firstName,
          lastName: form.lastName,
          cellNumber: form.cellNumber,
          carrier: form.carrier,
          email: form.email,
          notes: form.notes,
          consentGiven: true,
          consentText: CONSENT_TEXT,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Something went wrong. Please try again.");
        setSubmitting(false);
        return;
      }
      setSubmitted(true);
    } catch {
      setError("Network error. Please try again.");
    }
    setSubmitting(false);
  };

  if (submitted) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-10">
        <div className="border border-green-300 bg-green-50 text-green-900 rounded-lg p-6">
          <h1 className="text-2xl font-bold mb-3">Thank you — we&rsquo;ve got your info.</h1>
          <p className="mb-2">
            Your sign-up request has been submitted and will be reviewed by the
            tennis committee. If you provided a cell number and consented to
            texts, you&rsquo;ll receive schedule messages once your account is
            approved.
          </p>
          <p className="mb-2">
            To opt out of SMS at any time, reply <strong>STOP</strong> to any
            text you receive. Reply <strong>HELP</strong> for help.
          </p>
          <p className="text-sm text-green-800 mt-4">
            Questions? Contact the tennis committee at{" "}
            <a href="mailto:tennis@brooklakecc.example" className="underline">
              tennis@brooklakecc.example
            </a>
            .
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-2">
        Join the Tennis Program
      </h1>
      <p className="text-sm text-gray-600 mb-6">
        Brooklake Country Club — Tennis Program sign-up. Submissions are
        reviewed by the tennis committee before your player record is
        activated. Text-message notifications are <em>optional</em> — you
        can choose email-only communication instead.
      </p>

      {/* Program description */}
      <section className="border border-border rounded-lg p-4 mb-6 bg-gray-50 text-sm">
        <h2 className="font-semibold mb-2">What you&rsquo;re signing up for</h2>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li>
            A schedule of doubles tennis games at Brooklake&rsquo;s courts
            throughout the tennis season.
          </li>
          <li>
            Weekly reminders about your assigned games, court number, and
            start time.
          </li>
          <li>
            Occasional notifications about court changes, cancellations
            (weather, holidays), and seasonal updates.
          </li>
          <li>
            You&rsquo;ll be paired with other members at similar playing
            levels. The scheduling committee handles assignments.
          </li>
        </ul>
      </section>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Name */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block">
            <span className="text-sm font-medium">First name *</span>
            <input
              type="text"
              value={form.firstName}
              onChange={(e) => update("firstName", e.target.value)}
              required
              className="mt-1 w-full border border-border rounded px-3 py-2 text-sm"
              autoComplete="given-name"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Last name *</span>
            <input
              type="text"
              value={form.lastName}
              onChange={(e) => update("lastName", e.target.value)}
              required
              className="mt-1 w-full border border-border rounded px-3 py-2 text-sm"
              autoComplete="family-name"
            />
          </label>
        </div>

        {/* Cell */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block">
            <span className="text-sm font-medium">Cell phone number</span>
            <input
              type="tel"
              value={form.cellNumber}
              onChange={(e) => update("cellNumber", e.target.value)}
              placeholder="(555) 123-4567"
              className="mt-1 w-full border border-border rounded px-3 py-2 text-sm"
              autoComplete="tel"
            />
            <span className="text-xs text-gray-500 mt-1 block">
              Required only if you want SMS reminders.
            </span>
          </label>
          <label className="block">
            <span className="text-sm font-medium">Mobile carrier (optional)</span>
            <select
              value={form.carrier}
              onChange={(e) => update("carrier", e.target.value)}
              className="mt-1 w-full border border-border rounded px-3 py-2 text-sm bg-white"
            >
              {CARRIERS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Email */}
        <label className="block">
          <span className="text-sm font-medium">Email address</span>
          <input
            type="email"
            value={form.email}
            onChange={(e) => update("email", e.target.value)}
            placeholder="you@example.com"
            className="mt-1 w-full border border-border rounded px-3 py-2 text-sm"
            autoComplete="email"
          />
          <span className="text-xs text-gray-500 mt-1 block">
            We&rsquo;ll use this for email notifications and account confirmation.
          </span>
        </label>

        {/* Notes */}
        <label className="block">
          <span className="text-sm font-medium">Anything else we should know? (optional)</span>
          <textarea
            value={form.notes}
            onChange={(e) => update("notes", e.target.value)}
            rows={3}
            className="mt-1 w-full border border-border rounded px-3 py-2 text-sm"
            placeholder="Preferred playing days, skill level, questions, etc."
          />
        </label>

        {/* Consent block — this is the CTA the carrier reviewer needs to see */}
        <div className="border-2 border-amber-300 bg-amber-50 rounded-lg p-4">
          <h2 className="font-semibold text-amber-900 mb-2">
            Text-message consent (optional but required for SMS reminders)
          </h2>
          <div className="text-sm text-amber-900 mb-3 space-y-2">
            <p>{CONSENT_TEXT}</p>
          </div>
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.consent}
              onChange={(e) => update("consent", e.target.checked)}
              className="mt-1 accent-amber-600"
            />
            <span className="text-sm text-amber-900">
              <strong>
                Yes, I have read the above and consent to receive SMS text
                messages from Brooklake Country Club — Tennis Program at the
                cell number I provided.
              </strong>{" "}
              I understand I can reply <strong>STOP</strong> at any time to
              unsubscribe.
            </span>
          </label>
          <p className="text-xs text-amber-800 mt-3">
            See our{" "}
            <Link href="/sms-terms" className="underline" target="_blank">
              SMS Terms &amp; Privacy
            </Link>{" "}
            for the full policy, including how we handle your phone number
            and message data. We do not sell or share your information with
            third parties for marketing purposes.
          </p>
        </div>

        {error && (
          <div className="border border-red-300 bg-red-50 text-red-800 rounded px-4 py-3 text-sm">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full sm:w-auto bg-primary text-white font-semibold px-6 py-3 rounded-lg hover:opacity-90 transition disabled:opacity-50"
        >
          {submitting ? "Submitting…" : "Submit sign-up request"}
        </button>

        <p className="text-xs text-gray-500 mt-4">
          By submitting this form you confirm the information above is
          accurate. The tennis committee will contact you once your
          submission has been reviewed.
        </p>
      </form>
    </div>
  );
}
