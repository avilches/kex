import { Extension } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { lazyDecorationPlugin } from "@/modules/markdown/rich/extensions/lazyDecorationPlugin";

type MermaidModule = (typeof import("mermaid"))["default"];

export function createMermaidRenderer(isDark: () => boolean): Extension {
  return Extension.create({
    name: "mermaidRendererOptIn",
    addProseMirrorPlugins() {
      let mermaidPromise: Promise<MermaidModule | null> | null = null;
      const svgCache = new Map<string, string>();
      let renderCounter = 0;

      function loadMermaid(): Promise<MermaidModule | null> {
        if (!mermaidPromise) {
          mermaidPromise = import("mermaid")
            .then((m) => {
              const lib = m.default;
              lib.initialize({
                startOnLoad: false,
                theme: isDark() ? "dark" : "default",
                securityLevel: "strict",
                fontFamily: "inherit",
              });
              return lib;
            })
            .catch((e) => {
              console.error("[Mermaid] load failed", e);
              return null;
            });
        }
        return mermaidPromise;
      }

      function showError(container: HTMLElement, msg: string) {
        container.innerHTML = "";
        container.classList.remove("mermaid-render-loading");
        container.classList.add("mermaid-render-error");
        const text = document.createElement("div");
        text.textContent = msg;
        container.appendChild(text);
        addRetryButton(container, container.getAttribute("data-mermaid-source") || "");
      }

      function addRetryButton(container: HTMLElement, source: string) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "mermaid-render-btn mermaid-render-btn-small";
        btn.textContent = "↻ Retry";
        btn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          renderInto(container, source);
        };
        container.appendChild(btn);
      }

      async function svgToPngBlob(svgEl: SVGElement, scale = 2): Promise<Blob> {
        const clone = svgEl.cloneNode(true) as SVGElement;
        if (!clone.getAttribute("xmlns")) clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
        const svgString = new XMLSerializer().serializeToString(clone);
        const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
        const url = URL.createObjectURL(svgBlob);
        try {
          const img = new window.Image();
          await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject(new Error("SVG image load failed"));
            img.src = url;
          });
          const bbox = svgEl.getBoundingClientRect();
          const width = Math.max(Math.round(bbox.width || 800), 100);
          const height = Math.max(Math.round(bbox.height || 600), 100);
          const canvas = document.createElement("canvas");
          canvas.width = width * scale;
          canvas.height = height * scale;
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("Canvas not supported");
          ctx.scale(scale, scale);
          ctx.fillStyle = isDark() ? "#1e1e1e" : "#ffffff";
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
          return await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png");
          });
        } finally {
          URL.revokeObjectURL(url);
        }
      }

      function flashToast(container: HTMLElement, msg: string) {
        const existing = container.querySelector(".mermaid-render-toast");
        if (existing) existing.remove();
        const toast = document.createElement("div");
        toast.className = "mermaid-render-toast";
        toast.textContent = msg;
        container.appendChild(toast);
        setTimeout(() => {
          if (toast.parentElement) toast.remove();
        }, 1500);
      }

      async function copyDiagram(container: HTMLElement) {
        const svgEl = container.querySelector("svg") as SVGElement | null;
        if (!svgEl) return;
        try {
          const blob = await svgToPngBlob(svgEl);
          await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
          flashToast(container, "Copied");
        } catch (e: unknown) {
          console.error("[Mermaid] copy failed", e);
          flashToast(container, `Copy failed: ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      function addToolbar(container: HTMLElement, source: string) {
        const toolbar = document.createElement("div");
        toolbar.className = "mermaid-render-toolbar";

        const copyBtn = document.createElement("button");
        copyBtn.type = "button";
        copyBtn.className = "mermaid-render-action";
        copyBtn.title = "Copy as PNG";
        copyBtn.textContent = "Copy";
        copyBtn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          copyDiagram(container);
        };

        const reRenderBtn = document.createElement("button");
        reRenderBtn.type = "button";
        reRenderBtn.className = "mermaid-render-action";
        reRenderBtn.title = "Re-render diagram";
        reRenderBtn.textContent = "↻";
        reRenderBtn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          svgCache.delete(source);
          renderInto(container, source);
        };

        toolbar.appendChild(copyBtn);
        toolbar.appendChild(reRenderBtn);
        container.appendChild(toolbar);
      }

      async function renderInto(container: HTMLElement, source: string) {
        container.innerHTML = "";
        container.classList.remove("mermaid-render-error", "mermaid-render-idle");
        container.classList.add("mermaid-render-loading");

        const cached = svgCache.get(source);
        if (cached) {
          container.classList.remove("mermaid-render-loading");
          container.innerHTML = cached;
          addToolbar(container, source);
          return;
        }

        const mermaid = await loadMermaid();
        if (!mermaid) {
          showError(container, "Mermaid library failed to load.");
          return;
        }
        try {
          const parseOk = await mermaid.parse(source, { suppressErrors: true });
          if (!parseOk) {
            showError(container, "Invalid mermaid syntax.");
            return;
          }
          const id = `mermaid-${++renderCounter}`;
          const { svg } = await mermaid.render(id, source);
          svgCache.set(source, svg);
          if (container.isConnected) {
            container.classList.remove("mermaid-render-loading");
            container.innerHTML = svg;
            addToolbar(container, source);
          }
        } catch (e: unknown) {
          showError(container, `Render failed: ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      function makeIdleButton(source: string): HTMLElement {
        const container = document.createElement("div");
        container.className = "mermaid-render mermaid-render-idle";
        container.contentEditable = "false";
        container.setAttribute("data-mermaid-source", source);

        const cached = svgCache.get(source);
        if (cached) {
          container.classList.remove("mermaid-render-idle");
          container.innerHTML = cached;
          addToolbar(container, source);
          return container;
        }

        let rendered = false;
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "mermaid-render-btn";
        btn.textContent = "▶  Render diagram";
        btn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (rendered) return;
          rendered = true;
          renderInto(container, source);
        };
        container.appendChild(btn);

        if (typeof window.requestIdleCallback === "function") {
          window.requestIdleCallback(
            () => {
              if (rendered || !container.isConnected) return;
              rendered = true;
              renderInto(container, source);
            },
            { timeout: 3000 },
          );
        }

        return container;
      }

      function buildDecorations(doc: PMNode): DecorationSet {
        const decos: Decoration[] = [];
        doc.descendants((node, pos) => {
          if (node.type.name === "codeBlock" && node.attrs.language === "mermaid") {
            const source = node.textContent;
            if (!source.trim()) return;
            decos.push(
              Decoration.widget(pos + node.nodeSize, () => makeIdleButton(source), {
                side: 1,
                key: `mermaid:${source.length}:${svgCache.has(source) ? "r" : "i"}`,
              }),
            );
          }
        });
        return DecorationSet.create(doc, decos);
      }

      const pluginKey = new PluginKey("mermaidRendererOptIn");
      return [lazyDecorationPlugin(pluginKey, buildDecorations)];
    },
  });
}
