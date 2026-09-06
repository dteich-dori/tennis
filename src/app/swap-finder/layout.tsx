//  Standalone layout: no site nav. This page is public and is used on a
//  phone by someone who should never land on an admin screen.
export default function SwapFinderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
