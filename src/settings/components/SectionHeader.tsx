import type { ReactNode } from "react";

type Props = {
  title: string;
  right?: ReactNode;
};

export function SectionHeader({ title, right }: Props) {
  return (
    <div className="flex items-center justify-between gap-4">
      <h1 className="text-[18px] font-semibold tracking-tight">{title}</h1>
      {right}
    </div>
  );
}
