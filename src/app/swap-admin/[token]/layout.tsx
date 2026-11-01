import type { Metadata } from "next";

//  A private link: keep it out of search results.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Swap Admin",
  description: "Swap or give away a game.",
  applicationName: "Swap Admin",
  appleWebApp: {
    capable: true,
    title: "Swap Admin",
    statusBarStyle: "default",
  },
  icons: {
    icon: "/swap-icon-192.png",
    apple: "/swap-icon-180.png",
  },
};

export default function SwapAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
