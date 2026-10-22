export type ActionsTarget = { tab: "global" | "workspace"; id?: string };

// The Settings section a link to the Actions editor names: the tab, and the Action to open
// on it. It travels as the section parameter of the Settings window ("actions:workspace:<id>").
export const actionsSectionParam = (tab: ActionsTarget["tab"], id?: string): string =>
  id ? `actions:${tab}:${id}` : `actions:${tab}`;

// What follows "actions:" in that parameter.
export function parseActionsTarget(rest: string | undefined): ActionsTarget | null {
  if (!rest) return null;
  const [tab, ...tail] = rest.split(":");
  if (tab !== "global" && tab !== "workspace") return null;
  const id = tail.join(":");
  return id ? { tab, id } : { tab };
}
