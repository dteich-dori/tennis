/**
 * Public landing page that auto-redirects the browser to a `webcal://` URL.
 *
 * Purpose: Gmail (and some other email clients) sanitize `webcal://` hrefs in
 * HTML emails, making them unclickable. To work around this, the email links
 * to this https:// page instead. When the user clicks, the browser loads this
 * page and the inline script issues a client-side redirect to the webcal URL.
 * The OS then hands it off to the Calendar app, which prompts the user to
 * subscribe.
 *
 * Duplicate prevention: calendar apps do NOT deduplicate subscriptions by URL,
 * so clicking the link twice creates two copies of the same calendar. To
 * prevent this, we set a localStorage flag on first visit for the specific
 * token. On subsequent visits, we show a "You already subscribed on this
 * device" message instead of auto-redirecting. A small "Subscribe again"
 * button is provided for users who want to re-subscribe anyway (e.g. after
 * deleting the calendar).
 *
 * Preview mode (?preview=1) bypasses the dedup check and always redirects,
 * because preview is used for testing and repeated subscriptions are expected.
 *
 * No authentication — the token in the URL is the only credential. The
 * middleware allowlists `/calendar/subscribe/*` so this path is publicly
 * accessible without the site password.
 */

export default async function SubscribePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ preview?: string }>;
}) {
  const { token } = await params;
  const { preview } = await searchParams;
  const isPreview = preview === "1";
  const previewSuffix = isPreview ? "?preview=1" : "";
  const publicSite = process.env.PUBLIC_SITE_URL || "https://scheduler.teich.net";
  const webcalUrl =
    publicSite.replace(/^https?:\/\//, "webcal://") + `/api/ics/${token}${previewSuffix}`;
  const storageKey = `brooklake-subscribed-${token}`;

  // Build the boot script as a string so it runs before React hydration.
  // In preview mode, always redirect (no dedup).
  // Otherwise, check localStorage and either redirect (first visit) or reveal
  // the "already subscribed" panel (repeat visit).
  const bootScript = isPreview
    ? `setTimeout(function(){ window.location.href = ${JSON.stringify(webcalUrl)}; }, 100);`
    : `
(function () {
  var key = ${JSON.stringify(storageKey)};
  var alreadySubscribed = false;
  try { alreadySubscribed = !!window.localStorage.getItem(key); } catch (e) {}

  if (alreadySubscribed) {
    // Show the repeat panel, hide the first-visit panel, and don't redirect.
    var first = document.getElementById('first-visit');
    var repeat = document.getElementById('repeat-visit');
    if (first) first.style.display = 'none';
    if (repeat) repeat.style.display = 'block';
  } else {
    // Mark as subscribed for next time, then auto-redirect.
    try { window.localStorage.setItem(key, String(Date.now())); } catch (e) {}
    setTimeout(function(){ window.location.href = ${JSON.stringify(webcalUrl)}; }, 100);
  }
})();
`;

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Subscribe to Brooklake Tennis</title>
        {/* Meta refresh fallback — only active in preview mode (always redirect).
            In normal mode we leave this off so the localStorage check controls behavior. */}
        {isPreview && <meta httpEquiv="refresh" content={`0;url=${webcalUrl}`} />}
      </head>
      <body
        style={{
          fontFamily: "-apple-system, BlinkMacSystemFont, Arial, sans-serif",
          maxWidth: "480px",
          margin: "60px auto",
          padding: "24px",
          color: "#1e293b",
          textAlign: "center",
        }}
      >
        {/* First-visit panel (shown by default) */}
        <div id="first-visit">
          <h1 style={{ fontSize: "20px", marginBottom: "16px" }}>
            Brooklake Tennis Calendar
          </h1>
          <p style={{ color: "#475569", marginBottom: "24px" }}>
            Opening your calendar app to subscribe…
          </p>
          <p style={{ marginBottom: "24px" }}>
            <a
              href={webcalUrl}
              style={{
                display: "inline-block",
                background: "#2563eb",
                color: "#ffffff",
                padding: "12px 24px",
                textDecoration: "none",
                borderRadius: "6px",
                fontWeight: 600,
              }}
            >
              Subscribe in Calendar
            </a>
          </p>
          <p style={{ color: "#64748b", fontSize: "13px", lineHeight: "1.5" }}>
            If your calendar didn&apos;t open automatically, tap the button above.
            A new <strong>Brooklake Tennis</strong> calendar will be added to your
            calendar app. You can turn it on or off anytime without affecting your
            other calendars, and it will update automatically if the schedule changes.
          </p>
        </div>

        {/* Repeat-visit panel (hidden until the boot script reveals it) */}
        <div id="repeat-visit" style={{ display: "none" }}>
          <h1 style={{ fontSize: "20px", marginBottom: "16px" }}>
            You&apos;re already subscribed ✓
          </h1>
          <p style={{ color: "#475569", marginBottom: "16px", lineHeight: "1.5" }}>
            A <strong>Brooklake Tennis</strong> calendar was already added to this device.
            Open your calendar app to see it — it will update automatically as games change.
          </p>
          <p
            style={{
              color: "#64748b",
              fontSize: "13px",
              marginTop: "24px",
              marginBottom: "8px",
            }}
          >
            If you deleted it and want to re-subscribe:
          </p>
          <p>
            <a
              href={webcalUrl}
              style={{
                display: "inline-block",
                background: "#ffffff",
                color: "#2563eb",
                border: "1px solid #2563eb",
                padding: "8px 16px",
                textDecoration: "none",
                borderRadius: "6px",
                fontWeight: 500,
                fontSize: "13px",
              }}
            >
              Subscribe again
            </a>
          </p>
        </div>

        <script dangerouslySetInnerHTML={{ __html: bootScript }} />
      </body>
    </html>
  );
}
