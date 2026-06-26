import { Fragment } from "react";
import type React from "react";
import { Badge } from "@/components/ui/badge";
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
  // Second arg is the full trigger (BreadcrumbLink > button > Badge); wrap it, don't replace it.
  renderSegment?: (seg: PathSegment, trigger: React.ReactNode) => React.ReactNode;
  trailing?: React.ReactNode;
};

const RELATION_CLASS: Record<PathSegmentRelation, string> = {
  "above-root": "text-muted-foreground/60 hover:text-foreground",
  root: "text-foreground",
  "inside-root": "text-muted-foreground hover:text-foreground",
};

export function PathBreadcrumb({
  segments,
  onRevealPath,
  renderSegment,
  trailing,
}: PathBreadcrumbProps) {
  return (
    <div className="min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <Breadcrumb>
        <BreadcrumbList className="flex-nowrap gap-1 text-[11px] sm:gap-1">
          {segments.map((s) => {
            const badge = (
              <Badge
                variant="outline"
                className={cn(
                  "gap-1 whitespace-nowrap",
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
              </Badge>
            );
            const trigger = (
              <BreadcrumbLink asChild>
                <button
                  type="button"
                  onClick={() => onRevealPath(s.fullPath)}
                  title={s.fullPath}
                >
                  {badge}
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
