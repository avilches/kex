export type ZoomSyncDeps = {
  applyZoomToDom: (zoom: number) => void;
  refitTerminals: () => void;
};

// fit() measures the container, so --app-zoom must already be in the DOM
// when terminals refit; useZoom's effect only runs after React re-renders.
export function applyZoomThenRefit(
  zoom: number,
  hydrated: boolean,
  deps: ZoomSyncDeps,
): void {
  if (hydrated) deps.applyZoomToDom(zoom);
  deps.refitTerminals();
}
