import type { ReactNode } from "react";

type Props = { hibernated: boolean; children: ReactNode };

// A sleeping workspace has no live explorer or source control to show, so the
// sidebar is hidden behind an opaque cover instead of listing stale files.
export function HibernatedSidebarCover({ hibernated, children }: Props) {
  return (
    <div className="relative h-full min-h-0">
      {children}
      {hibernated && <div className="absolute inset-0 z-20 bg-background" />}
    </div>
  );
}
