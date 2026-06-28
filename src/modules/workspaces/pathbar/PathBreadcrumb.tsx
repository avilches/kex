import { Fragment } from "react";
import type React from "react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Home03Icon, PinIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "@/lib/utils";
import type { PathSegment, PathSegmentRelation } from "./cwdBreadcrumb";

type PathBreadcrumbProps = {
  segments: PathSegment[];
  onRevealPath: (path: string) => void;
  // Second arg is the full trigger (BreadcrumbLink > button); wrap it, don't replace it.
  renderSegment?: (seg: PathSegment, trigger: React.ReactNode) => React.ReactNode;
  trailing?: React.ReactNode;
  // When false, the breadcrumb only takes its content width (so siblings can sit right after it).
  grow?: boolean;
};

const RELATION_CLASS: Record<PathSegmentRelation, string> = {
  "above-root": "text-muted-foreground/60 hover:text-foreground hover:bg-muted/50",
  root: "text-foreground hover:bg-muted/50",
  "inside-root": "text-muted-foreground hover:text-foreground hover:bg-muted/50",
};

export function PathBreadcrumb({
  segments,
  onRevealPath,
  renderSegment,
  trailing,
  grow = true,
}: PathBreadcrumbProps) {
  return (
    <div
      className={cn(
        "min-w-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        grow && "flex-1",
      )}
    >
      <Breadcrumb>
        <BreadcrumbList className="flex-nowrap gap-0.5 text-[11px] sm:gap-0.5">
          {segments.map((s) => {
            const trigger = (
              <BreadcrumbLink asChild>
                <button
                  type="button"
                  onClick={() => onRevealPath(s.fullPath)}
                  title={s.fullPath}
                  className={cn(
                    "inline-flex items-center gap-1 whitespace-nowrap rounded px-1 py-0.5 transition-colors",
                    RELATION_CLASS[s.relation],
                  )}
                >
                  {s.isHome ? (
                    <HugeiconsIcon
                      icon={Home03Icon}
                      className="size-3"
                      strokeWidth={1.75}
                    />
                  ) : s.relation === "root" ? (
                    <HugeiconsIcon
                      icon={PinIcon}
                      className="size-3 text-primary"
                      strokeWidth={2}
                    />
                  ) : null}
                  {s.isHome ? "Home" : s.label}
                </button>
              </BreadcrumbLink>
            );
            return (
              <Fragment key={s.fullPath}>
                <BreadcrumbItem>
                  {renderSegment?.(s, trigger) ?? trigger}
                </BreadcrumbItem>
                <BreadcrumbSeparator className="[&>svg]:size-3" />
              </Fragment>
            );
          })}
          {trailing}
        </BreadcrumbList>
      </Breadcrumb>
    </div>
  );
}
