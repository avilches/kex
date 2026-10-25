import { DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { ActionIcon } from "@/modules/actions/ActionIcon";
import { ActionNameLines } from "@/modules/actions/ActionNameLines";
import { useNewTabActions } from "@/modules/actions/lib/useNewTabActions";
import { useActionMenuApi } from "@/modules/actions/RowActionsMenu";

// The Actions that run in the folder of a pane, at the end of its new-tab menu. Mounted only
// while the menu is open, so a closed menu costs nothing. Renders nothing without any.
export function NewTabActionItems({ folder }: { folder: string | null }) {
  const api = useActionMenuApi();
  const { groups, overlay } = useNewTabActions(api?.ws ?? null, folder);
  const run = api?.run;
  const sections = [
    { label: "Workspace actions", entries: groups.workspace },
    { label: "Global actions", entries: groups.global },
  ].filter((section) => section.entries.length > 0);
  if (!run || !overlay || sections.length === 0) return null;
  return (
    <>
      <DropdownMenuSeparator />
      {sections.map((section, i) => (
        <div key={section.label}>
          {i > 0 && <DropdownMenuSeparator />}
          <DropdownMenuLabel className="px-2 py-1 text-[10px]">{section.label}</DropdownMenuLabel>
          {section.entries.map((entry) => (
            <DropdownMenuItem key={entry.action.id} title={entry.title ?? undefined} onSelect={() => run(entry.action, overlay)}>
              <ActionIcon action={entry.action} size={14} fill />
              <span className="min-w-0 flex-1">
                <ActionNameLines name={entry.action.name} value={entry.subtitle} startTrim={entry.subtitleTrim} />
              </span>
            </DropdownMenuItem>
          ))}
        </div>
      ))}
    </>
  );
}
