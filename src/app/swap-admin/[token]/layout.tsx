import type { Metadata } from "next";

//  A private link: keep it out of search results. The manifest is per token
//  (see the route): the root manifest's start_url would otherwise win on
//  iOS and the home-screen icon would open the schedule app.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  return {
    robots: { index: false, follow: false },
    title: "Swap Admin",
    description: "Swap or give away a game.",
    applicationName: "Swap Admin",
    manifest: `/api/swap-admin/${token}/manifest`,
    appleWebApp: {
      capable: true,
      title: "Swap",
      statusBarStyle: "default",
    },
    icons: {
      icon: "/swap-icon-192.png",
      apple: "/swap-icon-180.png",
    },
  };
}

export default function SwapAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
