import { forwardRef, lazy, Suspense } from "react";
import type { ComponentProps } from "react";
import type {
  SourceControlPanel as SourceControlPanelType,
  SourceControlPanelHandle,
} from "./SourceControlPanel";

const SourceControlPanelInner = lazy(() =>
  import("./SourceControlPanel").then((m) => ({
    default: m.SourceControlPanel,
  })),
);

type Props = ComponentProps<typeof SourceControlPanelType>;

export const SourceControlPanel = forwardRef<SourceControlPanelHandle, Props>(
  function SourceControlPanel(props, ref) {
    return (
      <Suspense fallback={null}>
        <SourceControlPanelInner {...props} ref={ref} />
      </Suspense>
    );
  },
);
