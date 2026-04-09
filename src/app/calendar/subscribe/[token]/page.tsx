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
  const previewSuffix = preview === "1" ? "?preview=1" : "";
  // Host for webcal:// — we always use the canonical public site URL so the
  // calendar app subscribes to the right endpoint regardless of which deploy
  // URL was used to load this page.
  const publicSite = process.env.PUBLIC_SITE_URL || "https://scheduler.teich.net";
  const webcalUrl = publicSite.replace(/^https?:\/\//, "webcal://") + `/api/ics/${token}${previewSuffix}`;
  const httpsUrl = `${publicSite}/api/ics/${token}${previewSuffix}`;

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Subscribe to Brooklake Tennis</title>
        {/* Try redirecting immediately via meta refresh as a fallback */}
        <meta httpEquiv="refresh" content={`0;url=${webcalUrl}`} />
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
        {/* Progressive enhancement: try scheme redirect via JS too */}
        <script
          dangerouslySetInnerHTML={{
            __html: `setTimeout(function(){ window.location.href = ${JSON.stringify(
              webcalUrl
            )}; }, 100);`,
          }}
        />
        {/* Hidden for debugging if ever needed */}
        <div style={{ display: "none" }} data-https-url={httpsUrl} />
      </body>
    </html>
  );
}
