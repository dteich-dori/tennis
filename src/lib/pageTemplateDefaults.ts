// Default markdown content for each template slot. If a slot has no
// row in page_templates yet, this string is used. The admin editor at
// /page-templates lets you override any of them; "Reset to default"
// deletes the row so the code falls back to these values again.
//
// Defaults sync'd to the approved live wording as of July 2026. Keep
// this file in sync with any deliberate copy change so newly-cloned
// environments start from the approved content, and so "Reset to
// default" restores something sensible rather than the stale demo copy.

export interface TemplateSlot {
  key: string;
  label: string;
  helpText: string;
  contentType: "markdown" | "plain";
  defaultContent: string;
}

const SMS_TERMS_BODY_DEFAULT = `# SMS Terms & Privacy

DON's group at Brooklake Tennis Club

## Program description

The Don's group uses SMS text messages to send scheduling information to enrolled players. Messages are strictly transactional and program-related — game reminders, court assignments, cancellations (weather, holidays), and seasonal announcements. We do not send promotional, political, or marketing text messages.

## How consent is collected

Consent is collected in one of two ways:

1. Explicit opt-in via the public sign-up form at [/join](/join), where the user checks a clearly-labeled consent box next to the disclosure text. The exact wording the user agreed to is saved with every submission for our records.
2. Verbal or written consent given directly to the administrator at the time of enrollment. The player will receive a confirmation and a disclosure statement.

Consent to receive SMS is not a condition of joining the tennis program. Members may choose email-only communication and still participate fully.

## Message frequency

Frequency depends on how often you are scheduled to play and on schedule changes.

## Data & message rates

**Message and data rates may apply** depending on your mobile carrier and plan.

## Opting out (STOP)

You can unsubscribe at any time by replying **STOP** to any text message you receive from us. You will receive one final confirmation message and will not receive any further SMS messages. To re-subscribe, contact the group administrator at 973-493-4959.

## Help (HELP)

Reply **HELP** to any of our messages and you will receive a reply with instructions on how to contact the administrator. You may also reach us at the email address below.

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
- **Retention.** We keep your record for as long as you are an active tennis-program member. You can request deletion at any time by contacting the administrator.

## Contact

Questions about SMS communications, opt-out, or your data:

DON's group at Brooklake Tennis Club
Administrator: Dori Teich
Email: [dori.teich@gmail.com](mailto:dori.teich@gmail.com)
Phone: 973-493-4959

---

*Last updated: July 1, 2026.*

Want to sign up? Go to [/join](/join).`;

const JOIN_DESCRIPTION_DEFAULT = `**DON's group at Brooklake Tennis Club — Tennis games sign-up.** Submissions are reviewed by the administrator before your player record is activated. Text-message notifications are *optional* — you can choose email-only communication instead.

## What you're signing up for

- A schedule of doubles tennis games at Brooklake's courts throughout the tennis season.
- Day-before reminders about your assigned games, court number, and start time.
- Occasional notifications about court changes, cancellations (weather, holidays), and seasonal updates.
- The administrator handles assignments, taking into consideration your availability, vacations, and playing-level preferences.`;

const JOIN_CONSENT_TEXT_DEFAULT = `I agree to receive SMS text messages from Don's group at the Brooklake Tennis Club at the mobile number I provided. Messages are game-schedule and program-related (reminders, cancellations, court changes, seasonal updates). Message frequency varies but typically runs 2–5 messages per week during the tennis season. Message and data rates may apply. Reply STOP to any text message from the group to immediately unsubscribe at any time; reply HELP for help. Consent to receive text messages is not a condition of joining the tennis program — I can also request email-only communication. See the SMS Terms & Privacy page for full details.`;

const JOIN_THANK_YOU_DEFAULT = `## Thank you — we've got your info.

Your sign-up request has been received and will be reviewed promptly. If you provided a cell number and consented to texts, you'll receive schedule messages once your account is approved.

To opt out of SMS at any time, reply **STOP** to any text you receive. Reply **HELP** for help.

Questions? Contact the administrator via [dori.teich@gmail.com](mailto:dori.teich@gmail.com).`;

const PRIVACY_BODY_DEFAULT = `# Privacy Policy

DON's group at Brooklake Tennis Club

This Privacy Policy describes how we collect, use, and share personal information for the SMS text messaging service operated by the DON's group at Brooklake Tennis Club.

## Information we collect

The sign-up form at [/join](/join) and the internal player record collect only the information reasonably needed to run the tennis program:

- Name.
- Cell phone number (only if you opt in to SMS).
- Mobile carrier (optional — used only to improve SMS reliability).
- Email address (used for email notifications and account confirmation).
- Skill level, playing preferences, and vacation dates as needed for scheduling.

## How we use your information

- **Program operations only.** Contact details are used solely to communicate about your participation in the tennis program (game reminders, cancellations, schedule changes, invoices where applicable).
- **No sale, no marketing sharing.** We do not sell, rent, or share your personal information — including your phone number — with third parties for marketing or promotional purposes.
- **Service providers.** To deliver text messages we use Twilio, Inc. as our SMS provider; email is delivered via standard email service providers. These providers process your phone number and email only to transmit our messages to you and are contractually restricted from using the data for any other purpose.
- **Retention.** We keep your record for as long as you are an active tennis-program member. You can request deletion at any time by contacting the administrator.

## Your choices

- You may **opt out of SMS** at any time by replying **STOP** to any message you receive. See our [Terms of Service](/terms) for the complete list of opt-out keywords.
- You may **choose email-only** communication and still participate fully in the tennis program.
- You may **request deletion** of your record at any time by contacting the administrator.

## Contact

Questions about your data or this Privacy Policy:

DON's group at Brooklake Tennis Club
Administrator: Dori Teich
Email: [dori.teich@gmail.com](mailto:dori.teich@gmail.com)
Phone: 973-493-4959

---

*Last updated: July 1, 2026.*

See also: [Terms of Service](/terms) · [Sign up](/join)`;

const TERMS_BODY_DEFAULT = `# Terms of Service

DON's group at Brooklake Tennis Club — SMS text-messaging service

These Terms of Service govern your use of the SMS text-messaging service operated by the DON's group at Brooklake Tennis Club. By opting in via the sign-up form at [/join](/join) or by giving verbal or written consent to the administrator, you agree to these terms.

## Program description

The Don's group uses SMS text messages to send scheduling information to enrolled players. Messages are strictly transactional and program-related — game reminders, court assignments, cancellations (weather, holidays), and seasonal announcements. We do not send promotional, political, or marketing text messages.

## How consent is collected

Consent is collected in one of two ways:

1. Explicit opt-in via the public sign-up form at [/join](/join), where the user checks a clearly-labeled consent box next to the disclosure text. The exact wording the user agreed to is saved verbatim with every submission for our records.
2. Verbal or written consent given directly to the administrator at the time of enrollment. The player will receive a confirmation and a disclosure statement.

Consent to receive SMS is not a condition of joining the tennis program. Members may choose email-only communication and still participate fully.

## Message frequency

Frequency depends on how often you are scheduled to play and on schedule changes. Message volume typically ranges from 2 to 5 messages per week during the tennis season and drops to 0 to 1 messages per week during the off-season.

## Data & message rates

**Message and data rates may apply** depending on your mobile carrier and plan. The DON's group at Brooklake Tennis Club does not charge for SMS; any fees are those imposed by your carrier.

## Opting out (STOP)

You can unsubscribe at any time by replying **STOP**, **STOPALL**, **UNSUBSCRIBE**, **CANCEL**, **END**, or **QUIT** to any text message. You will receive one final confirmation message and will not receive any further SMS messages. To re-subscribe, reply **START** or **YES**, or contact the administrator at 973-493-4959.

## Help (HELP)

Reply **HELP** or **INFO** to any of our messages and you will receive a reply with instructions on how to contact the administrator.

## Privacy

See our [Privacy Policy](/privacy) for how we collect, use, and share your personal information.

## Contact

Questions about the service or these Terms:

DON's group at Brooklake Tennis Club
Administrator: Dori Teich
Email: [dori.teich@gmail.com](mailto:dori.teich@gmail.com)
Phone: 973-493-4959

---

*Last updated: July 1, 2026.*

See also: [Privacy Policy](/privacy) · [Sign up](/join)`;

export const TEMPLATE_SLOTS: TemplateSlot[] = [
  {
    key: "sms-terms-body",
    label: "SMS Terms page — full body",
    helpText:
      "The entire body of /sms-terms as Markdown. Kept for legacy bookmarks; the split Privacy Policy (/privacy) and Terms of Service (/terms) pages are what Twilio's reviewer sees now.",
    contentType: "markdown",
    defaultContent: SMS_TERMS_BODY_DEFAULT,
  },
  {
    key: "privacy-policy-body",
    label: "Privacy Policy page — full body",
    helpText:
      "The entire body of /privacy as Markdown. Focus on data collection, use, sharing, and retention. This is the URL you paste as the Privacy Policy URL in your Twilio campaign submission.",
    contentType: "markdown",
    defaultContent: PRIVACY_BODY_DEFAULT,
  },
  {
    key: "terms-of-service-body",
    label: "Terms of Service page — full body",
    helpText:
      "The entire body of /terms as Markdown. Focus on program description, opt-in flow, message frequency, STOP/HELP, and opt-out procedure. This is the URL you paste as the Terms of Service URL in your Twilio campaign submission.",
    contentType: "markdown",
    defaultContent: TERMS_BODY_DEFAULT,
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
