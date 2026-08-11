/// <reference types="vite/client" />

// markdown-it-mark, markdown-it-sub and markdown-it-sup ship no type declarations.
declare module "markdown-it-mark" {
  import type { PluginSimple } from "markdown-it";
  const plugin: PluginSimple;
  export default plugin;
}
declare module "markdown-it-sub" {
  import type { PluginSimple } from "markdown-it";
  const plugin: PluginSimple;
  export default plugin;
}
declare module "markdown-it-sup" {
  import type { PluginSimple } from "markdown-it";
  const plugin: PluginSimple;
  export default plugin;
}
