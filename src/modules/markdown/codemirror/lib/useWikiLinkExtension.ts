import { Compartment, type Extension } from "@codemirror/state";
import type { ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { type RefObject, useEffect, useMemo, useRef } from "react";
import { type WikiLinkHost, wikiLinkHost } from "@/modules/markdown/codemirror/lib/livePreviewPlugin";

// The extension keeps one stable identity (a new one would make
// @uiw/react-codemirror rebuild the whole view); a later host reaches the live
// view through the compartment instead.
export function useWikiLinkExtension(
  cmRef: RefObject<ReactCodeMirrorRef | null>,
  host: WikiLinkHost | undefined,
): Extension {
  const compartment = useMemo(() => new Compartment(), []);
  const initial = useRef(host);
  useEffect(() => {
    cmRef.current?.view?.dispatch({ effects: compartment.reconfigure(host ? wikiLinkHost.of(host) : []) });
  }, [cmRef, compartment, host]);
  return useMemo(
    () => compartment.of(initial.current ? wikiLinkHost.of(initial.current) : []),
    [compartment],
  );
}
