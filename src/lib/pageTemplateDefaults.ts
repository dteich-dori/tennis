// Default markdown content for each template slot. If a slot has no
// row in page_templates yet, this string is used. The admin editor at
// /page-templates lets you override any of them; "Reset to default"
// deletes the row so the code falls back to these values again.

export interface TemplateSlot {
  key: string;
  label: string;
  helpText: string;
  contentType: "markdown" | "plain";
  defaultContent: string;
}

const SMS_TERMS_BODY_DEFAULT = `# SMS Terms & Privacy

Brooklake Country Club — Tennis Program

## Program description

The Brooklake Country Club Tennis Program uses SMS text messages to send scheduling information to enrolled players. Messages are strictly transactional and program-related — game reminders, court assignments, cancellations (weather, holidays), and seasonal announcements. We do not send promotional or marketing text messages.

## How consent is collected

Consent is collected in one of two ways:

1. Explicit opt-in via the public sign-up form at [/join](/join), where the user checks a clearly-labeled consent box next to the disclosure text. The exact wording the user agreed to is saved with every submission for our records.
2. Verbal or written consent given directly to the tennis committee at the time of enrollment. In this case, the committee member entering the record confirms the member has been shown the same disclosure text used on the online form and has agreed to it.

Consent to receive SMS is **not** a condition of joining the tennis program. Members may choose email-only communication and still participate fully.

## Message frequency

Approximately **2 to 5 messages per week during the tennis season** (September through late May). Message volume drops to **0 to 1 messages per week** during the summer off-season. Frequency depends on how often you are scheduled and on schedule changes.

## Data & message rates

**Message and data rates may apply** depending on your mobile carrier and plan. The Brooklake Country Club Tennis Program does not charge members for SMS messages; any fees are those imposed by your carrier.

## Opting out (STOP)

You may unsubscribe at any time by replying **STOP** to any text message you receive from us. You will receive one final confirmation message and will not receive any further SMS messages. To re-subscribe, contact the tennis committee.

## Help (HELP)

Reply **HELP** to any of our messages and you will receive a reply with instructions on how to contact the tennis committee. You may also reach us at the email address below.

## Information we collect

The sign-up form and player record collect only the information reasonably needed to run the tennis program:

- Name.
- Cell phone number (only if you opt in to SMS).
- Mobile carrier (optional — used only to improve SMS reliability).
- Email address (used for email notifications and account confirmation).
- Skill level, playing preferences, and vacation dates as needed for scheduling.

## How we use and share your information

- **Program operations only.** Contact details are used solely to communicate about your participation in the tennis program (game reminders, cancellations, schedule changes, invoices where applicable).
- **No sale, no marketing sharing.** We do not sell, rent, or share your personal information — including your phone number — with third parties for marketing or promotional purposes.
- **Service providers.** To deliver text messages we use Twilio, Inc. as our SMS provider; email is delivered via standard email service providers. These providers process your phone number and email only to transmit our messages to you and are contractually restricted from using the data for any other purpose.
- **Retention.** We keep your record for as long as you are an active tennis-program member. You can request deletion at any time by contacting the committee.

## Contact

Questions about SMS communications, opt-out, or your data:

Brooklake Country Club — Tennis Committee
Email: [tennis@brooklakecc.example](mailto:tennis@brooklakecc.example)

---

*Last updated: July 1, 2026.*

Want to sign up? Go to [/join](/join).`;

const JOIN_DESCRIPTION_DEFAULT = `**Brooklake Country Club — Tennis Program sign-up.** Submissions are reviewed by the tennis committee before your player record is activated. Text-message notifications are *optional* — you can choose email-only communication instead.

## What you're signing up for

- A schedule of doubles tennis games at Brooklake's courts throughout the tennis season.
- Weekly reminders about your assigned games, court number, and start time.
- Occasional notifications about court changes, cancellations (weather, holidays), and seasonal updates.
- You'll be paired with other members at similar playing levels. The scheduling committee handles assignments.`;

const JOIN_CONSENT_TEXT_DEFAULT = `I agree to receive SMS text messages from Brooklake Country Club — Tennis Program at the mobile number I provided. Messages are game-schedule and program-related (reminders, cancellations, court changes, seasonal updates). Message frequency varies but typically runs 2–5 messages per week during the tennis season. Message and data rates may apply. Reply STOP to unsubscribe at any time; reply HELP for help. Consent to receive text messages is not a condition of joining the tennis program — I can also request email-only communication. See the SMS Terms & Privacy page for full details.`;

const JOIN_THANK_YOU_DEFAULT = `## Thank you — we've got your info.

Your sign-up request has been submitted and will be reviewed by the tennis committee. If you provided a cell number and consented to texts, you'll receive schedule messages once your account is approved.

To opt out of SMS at any time, reply **STOP** to any text you receive. Reply **HELP** for help.

Questions? Contact the tennis committee at [tennis@brooklakecc.example](mailto:tennis@brooklakecc.example).`;

export const TEMPLATE_SLOTS: TemplateSlot[] = [
  {
    key: "sms-terms-body",
    label: "SMS Terms page — full body",
    helpText:
      "The entire body of /sms-terms as Markdown. This is the URL your Twilio campaign submission points to. Any change here takes effect immediately on the live page.",
    contentType: "markdown",
    defaultContent: SMS_TERMS_BODY_DEFAULT,
  },
  {
    key: "join-description",
    label: "Join page — intro & program description",
    helpText:
      "Shown above the sign-up form on /join. Markdown supported (headings, lists, links, bold, italic).",
    contentType: "markdown",
    defaultContent: JOIN_DESCRIPTION_DEFAULT,
  },
  {
    key: "join-consent-text",
    label: "Join page — SMS consent statement",
    helpText:
      "Plain text shown inside the amber consent box on /join. This is also the exact text FROZEN with every submission for A2P 10DLC audit evidence — the reviewer sees it, and every consent record stores it verbatim. Edit carefully; changes here don't affect past submissions.",
    contentType: "plain",
    defaultContent: JOIN_CONSENT_TEXT_DEFAULT,
  },
  {
    key: "join-thank-you",
    label: "Join page — thank-you message after submission",
    helpText:
      "Shown on /join after a successful submission. Markdown supported.",
    contentType: "markdown",
    defaultContent: JOIN_THANK_YOU_DEFAULT,
  },
];

export function getDefaultContent(key: string): string {
  return TEMPLATE_SLOTS.find((s) => s.key === key)?.defaultContent ?? "";
}
