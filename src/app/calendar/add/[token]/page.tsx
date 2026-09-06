/**
 * Public landing page for a ONE-TIME calendar import.
 *
 * The sibling /calendar/subscribe page hands the browser a webcal:// URL,
 * which creates a live but READ-ONLY subscription: the player cannot edit
 * or delete an event. That breaks down here, because swaps are agreed on
 * the club bulletin board and never reach this system — a subscription
 * would keep showing a game the player has swapped away.
 *
 * This page instead downloads the .ics as a file. Opening it COPIES the
 * games into the player's own calendar, where they own them: a swapped
 * game can be deleted and the replacement typed in. The calendar never
 * updates itself again, which is the honest trade.
 *
 * No authentication — the token in the URL is the only credential. The
 * middleware allowlists /calendar/add/* so it works without the site
 * password.
 */

export default async function AddToCalendarPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const publicSite = process.env.PUBLIC_SITE_URL || "https://scheduler.teich.net";
  const fileUrl = `${publicSite}/api/ics/${token}?download=1`;

  return (
    <html lang="en">
      <head>
        <title>Add your games to your calendar</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body
        style={{
          margin: 0,
          padding: "24px 18px",
          background: "#fff",
          color: "#171717",
          font: "16px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        }}
      >
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          <h1 style={{ fontSize: 24, margin: "0 0 8px" }}>
            Add your games to your calendar
          </h1>
          <p style={{ color: "#555", margin: "0 0 22px" }}>
            One tap adds your whole season. You can edit or delete any game
            afterwards, just like an appointment you typed in yourself.
          </p>

          <a
            href={fileUrl}
            style={{
              display: "block",
              background: "#2563eb",
              color: "#fff",
              textDecoration: "none",
              textAlign: "center",
              padding: "18px 24px",
              borderRadius: 12,
              fontSize: 20,
              fontWeight: 600,
            }}
          >
            Add my games
          </a>

          <div
            style={{
              marginTop: 26,
              padding: "16px 18px",
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: 12,
            }}
          >
            <p style={{ margin: "0 0 10px", fontWeight: 600 }}>On an iPhone</p>
            <p style={{ margin: 0, color: "#444" }}>
              Tap the button, then tap <strong>Add All</strong> and choose which
              calendar to put them in.
            </p>
          </div>

          <div
            style={{
              marginTop: 16,
              padding: "16px 18px",
              background: "#fffbeb",
              border: "1px solid #fde68a",
              borderRadius: 12,
            }}
          >
            <p style={{ margin: "0 0 10px", fontWeight: 600 }}>
              Please read — about swaps
            </p>
            <p style={{ margin: 0, color: "#444" }}>
              These are your games as scheduled today. This calendar will
              <strong> not update by itself</strong>. When you swap a game,
              delete it from your calendar and add the new one — the swap board
              at the club stays the official record.
            </p>
          </div>

          <p style={{ marginTop: 22, fontSize: 14, color: "#777" }}>
            Nothing happens to your calendar until you confirm on the next
            screen.
          </p>
        </div>
      </body>
    </html>
  );
}
