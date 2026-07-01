import Link from "next/link";

// Public SMS Terms & Privacy page — referenced from /join and from the
// footer of the tennis program's SMS communications. This is the URL
// the A2P 10DLC campaign submission points to as proof of consent
// disclosure. Copy is intentionally plain-English and standalone; the
// user can edit as needed but should NOT delete the required elements
// (message types, frequency, data rates, HELP/STOP, contact address).

export default function SmsTermsPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-10 text-sm text-gray-800 leading-relaxed space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-1">SMS Terms &amp; Privacy</h1>
        <p className="text-gray-500">
          Brooklake Country Club — Tennis Program
        </p>
      </div>

      <section>
        <h2 className="text-lg font-semibold mb-2">Program description</h2>
        <p>
          The Brooklake Country Club Tennis Program uses SMS text messages
          to send scheduling information to enrolled players. Messages are
          strictly transactional and program-related — they cover game
          reminders, court assignments, cancellations (weather, holidays),
          and seasonal announcements. We do not send promotional or
          marketing text messages.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">How consent is collected</h2>
        <p>
          Consent is collected in one of two ways:
        </p>
        <ol className="list-decimal list-inside space-y-1 mt-2">
          <li>
            Explicit opt-in via the public sign-up form at{" "}
            <Link href="/join" className="text-primary underline">
              /join
            </Link>
            , where the user checks a clearly-labeled consent box next to
            the disclosure text. The exact wording the user agreed to is
            saved with every submission for our records.
          </li>
          <li>
            Verbal or written consent given directly to the tennis
            committee at the time of enrollment. In this case, the
            committee member entering the record confirms the member has
            been shown the same disclosure text used on the online form
            and has agreed to it.
          </li>
        </ol>
        <p className="mt-2">
          Consent to receive SMS is <strong>not</strong> a condition of
          joining the tennis program. Members may choose email-only
          communication and still participate fully.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">Message frequency</h2>
        <p>
          Approximately <strong>2 to 5 messages per week during the
          tennis season</strong> (September through late May). Message
          volume drops to <strong>0 to 1 messages per week</strong> during
          the summer off-season. Frequency depends on how often you are
          scheduled and on schedule changes.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">Data &amp; message rates</h2>
        <p>
          <strong>Message and data rates may apply</strong> depending on
          your mobile carrier and plan. The Brooklake Country Club Tennis
          Program does not charge members for SMS messages; any fees are
          those imposed by your carrier.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">Opting out (STOP)</h2>
        <p>
          You may unsubscribe at any time by replying <strong>STOP</strong>{" "}
          to any text message you receive from us. You will receive one
          final confirmation message and will not receive any further SMS
          messages. To re-subscribe, contact the tennis committee.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">Help (HELP)</h2>
        <p>
          Reply <strong>HELP</strong> to any of our messages and you will
          receive a reply with instructions on how to contact the tennis
          committee. You may also reach us at the email address below.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">Information we collect</h2>
        <p>
          The sign-up form and player record collect only the information
          reasonably needed to run the tennis program:
        </p>
        <ul className="list-disc list-inside space-y-1 mt-2">
          <li>Name.</li>
          <li>Cell phone number (only if you opt in to SMS).</li>
          <li>Mobile carrier (optional — used only to improve SMS reliability).</li>
          <li>Email address (used for email notifications and account confirmation).</li>
          <li>Skill level, playing preferences, and vacation dates as needed for scheduling.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">
          How we use and share your information
        </h2>
        <ul className="list-disc list-inside space-y-1">
          <li>
            <strong>Program operations only.</strong> Contact details are
            used solely to communicate about your participation in the
            tennis program (game reminders, cancellations, schedule
            changes, invoices where applicable).
          </li>
          <li>
            <strong>No sale, no marketing sharing.</strong> We do not
            sell, rent, or share your personal information — including
            your phone number — with third parties for marketing or
            promotional purposes.
          </li>
          <li>
            <strong>Service providers.</strong> To deliver text messages
            we use Twilio, Inc. as our SMS provider; email is delivered
            via standard email service providers. These providers process
            your phone number and email only to transmit our messages to
            you and are contractually restricted from using the data for
            any other purpose.
          </li>
          <li>
            <strong>Retention.</strong> We keep your record for as long
            as you are an active tennis-program member. You can request
            deletion at any time by contacting the committee.
          </li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">Contact</h2>
        <p>
          Questions about SMS communications, opt-out, or your data:
        </p>
        <p className="mt-2">
          Brooklake Country Club — Tennis Committee
          <br />
          Email:{" "}
          <a
            href="mailto:tennis@brooklakecc.example"
            className="text-primary underline"
          >
            tennis@brooklakecc.example
          </a>
        </p>
      </section>

      <section className="text-xs text-gray-500 border-t border-gray-200 pt-4">
        <p>Last updated: July 1, 2026.</p>
        <p className="mt-2">
          Want to sign up? Go to{" "}
          <Link href="/join" className="text-primary underline">
            /join
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
