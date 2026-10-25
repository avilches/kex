import {
  closestCenter,
  type CollisionDetection,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragOverEvent,
  type DragStartEvent,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { newActionId } from "@/lib/ids";
import { ActionEditDialog } from "./ActionEditDialog";
import { ActionRow, ActionRowView } from "./ActionRow";
import { AddActionMenu } from "./AddActionMenu";
import {
  columnDropId,
  isDropCandidate,
  locateAction,
  parseColumnDropId,
  resolveDrop,
  type Scope,
} from "./lib/actionDrop";
import { KIND_ORDER } from "./lib/actionsBar";
import { ownedAfterEdit } from "./lib/appOwnership";
import { actionFromSuggestion, presetOf, uninstalledSuggestions, type AppSuggestion } from "./lib/appSuggestions";
import type { ActionContext } from "./lib/useActionContext";
import type { Action, ActionKind } from "./lib/types";

export type ScopeEditor = {
  /** The saved Actions of the scope. A new command only lives in the editor until it has one. */
  actions: readonly Action[];
  context: ActionContext | null;
  /** False while the scope cannot be edited (no workspace is open): its column says so. */
  available: boolean;
  /**
   * May return a promise: when it rejects, a command the user was typing keeps its draft and can
   * be saved again. A picked app preset has no draft and shows the host's toast instead.
   */
  onAdd: (action: Action) => void | Promise<unknown>;
  onUpdate: (id: string, next: Action) => void;
  onRemove: (id: string) => void;
  onReorder: (fromId: string, toId: string) => void;
};

type Props = {
  global: ScopeEditor;
  workspace: ScopeEditor;
  workspaceName: string | null;
  suggestions: readonly AppSuggestion[];
  /** Moving never copies: the Action leaves one scope and joins the other. */
  onMove: (from: Scope, to: Scope, id: string) => void;
  /** Opens one Action in its modal, once, as soon as it is in the list; a new `nonce` asks again. */
  focusRequest?: { scope: Scope; id: string; nonce: number };
};

// The kind is chosen once, on creation, and a saved Action cannot switch it afterwards.
function blankScript(): Action {
  return { id: newActionId(), name: "", kind: "script", command: "", cwdMode: "home", ownButton: false };
}

function blankApp(): Action {
  return { id: newActionId(), name: "", kind: "app", command: "", ownButton: false };
}

// A preset carries its own kind: an app preset is an app, an agent preset an agent that starts
// where the preset says.
const GROUP_LABELS: Record<ActionKind, string> = { script: "Scripts", app: "Applications", agent: "Agents" };

const COLUMN_TITLES: Record<Scope, string> = { global: "Global", workspace: "This workspace" };

// Both scopes side by side: the current workspace on the left, Global on the right, and a
// drag from one column to the other moves the Action. An Action is edited in a modal, never
// inline. A new action is a draft until it has a command, because an Action with no command
// is not valid and the stores refuse it; closing the modal forgets a draft with none. An app
// preset arrives with a command, so it is handed straight to the store. Editing a preset
// changes it into the user's own (see `ownedAfterEdit`).
export function ActionsColumns({ global, workspace, workspaceName, suggestions, onMove, focusRequest }: Props) {
  const scopes = { global, workspace };
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const [draft, setDraft] = useState<{ scope: Scope; action: Action } | null>(null);
  const [editing, setEditing] = useState<{ scope: Scope; id: string } | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hoverScope, setHoverScope] = useState<Scope | null>(null);
  // Drafts already handed to the store, which has not echoed them back yet.
  const handedOver = useRef<Set<string>>(new Set());
  // Actions the user removed; the modal's unmount flush must not bring them back.
  const removing = useRef<Set<string>>(new Set());
  const scopesRef = useRef(scopes);
  scopesRef.current = scopes;

  const lists = { global: global.actions, workspace: workspace.actions };
  const available = { global: global.available, workspace: workspace.available };

  // A draft stays until the store shows an Action with its id.
  useEffect(() => {
    if (moving.current && editing?.id === moving.current && scopes[editing.scope].actions.some((a) => a.id === moving.current)) {
      moving.current = null;
    }
    if (!draft || !scopes[draft.scope].actions.some((a) => a.id === draft.action.id)) return;
    handedOver.current.delete(draft.action.id);
    setDraft(null);
  });

  // An Action being moved between scopes by the modal is in neither list for a moment: the
  // modal keeps the last copy it saw until the new scope shows it.
  const moving = useRef<string | null>(null);
  // Set with `moving` but kept until the modal closes: a list that lags behind can drop the
  // Action again after it landed, and the modal must not go with it.
  const moved = useRef<string | null>(null);
  const lastShown = useRef<Action | null>(null);
  const editedAction = (() => {
    if (!editing) return null;
    const saved = scopes[editing.scope].actions.find((a) => a.id === editing.id);
    if (saved) return saved;
    if (draft?.action.id === editing.id) return draft.action;
    return moved.current === editing.id && !removing.current.has(editing.id) ? lastShown.current : null;
  })();
  if (editedAction) lastShown.current = editedAction;
  const editedSaved =
    !!editing && (moved.current === editing.id || lists.global.some((a) => a.id === editing.id) || lists.workspace.some((a) => a.id === editing.id));

  const change = (scope: Scope, current: Action, next: Action) => {
    if (removing.current.has(current.id) || moving.current === current.id) return;
    if (moved.current === current.id && !scopesRef.current[scope].actions.some((a) => a.id === current.id)) return;
    const owned = ownedAfterEdit(current, next, suggestions);
    const target = scopesRef.current[scope];
    if (target.actions.some((a) => a.id === current.id)) {
      target.onUpdate(current.id, owned);
      return;
    }
    setDraft({ scope, action: owned });
    if (owned.command.trim() && !handedOver.current.has(current.id)) {
      handedOver.current.add(current.id);
      Promise.resolve(target.onAdd(owned)).catch(() => handedOver.current.delete(current.id));
    }
  };

  const startDraft = (scope: Scope, created: Action) => {
    setDraft({ scope, action: created });
    setEditing({ scope, id: created.id });
  };

  const addApp = (scope: Scope, s: AppSuggestion) => {
    if (!s.defaultCommand.trim()) return startDraft(scope, blankApp());
    Promise.resolve(scopes[scope].onAdd(actionFromSuggestion(s))).catch(() => {});
  };

  // The modal's scope radio: a saved Action moves like a drag does, an empty draft only changes
  // where it will be added. A draft the store has not echoed yet stays where it was sent.
  const switchScope = (to: Scope) => {
    if (!editing || to === editing.scope || !scopes[to].available) return;
    const { id, scope: from } = editing;
    if (lists[from].some((a) => a.id === id)) {
      moving.current = id;
      moved.current = id;
      onMove(from, to, id);
    } else if (handedOver.current.has(id)) {
      return;
    } else {
      setDraft((d) => (d?.action.id === id ? { scope: to, action: d.action } : d));
    }
    setEditing({ scope: to, id });
  };

  const closeEditor = () => {
    moving.current = null;
    moved.current = null;
    setEditing(null);
    setDraft((d) => (d && !handedOver.current.has(d.action.id) ? null : d));
  };

  const remove = (scope: Scope, action: Action) => {
    removing.current.add(action.id);
    scopes[scope].onRemove(action.id);
  };

  const handledFocus = useRef<number | null>(null);
  useEffect(() => {
    if (!focusRequest || handledFocus.current === focusRequest.nonce) return;
    if (!scopes[focusRequest.scope].actions.some((a) => a.id === focusRequest.id)) return;
    handledFocus.current = focusRequest.nonce;
    setEditing({ scope: focusRequest.scope, id: focusRequest.id });
    requestAnimationFrame(() =>
      document.querySelector(`[data-action-row="${CSS.escape(focusRequest.id)}"]`)?.scrollIntoView({ block: "nearest" }),
    );
  });

  const collision: CollisionDetection = (args) =>
    closestCenter({
      ...args,
      droppableContainers: args.droppableContainers.filter((c) => isDropCandidate(lists, String(c.id), String(args.active.id))),
    });

  const hoverOf = (e: DragOverEvent | DragEndEvent): Scope | null => {
    if (!e.over) return null;
    const over = String(e.over.id);
    const scope = parseColumnDropId(over) ?? locateAction(lists, over)?.scope ?? null;
    const own = locateAction(lists, String(e.active.id))?.scope;
    return scope && scope !== own && available[scope] ? scope : null;
  };

  const dragStart = ({ active }: DragStartEvent) => setActiveId(String(active.id));
  const dragOver = (e: DragOverEvent) => setHoverScope(hoverOf(e));
  const dragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    setHoverScope(null);
    if (!e.over) return;
    const result = resolveDrop(lists, available, String(e.active.id), String(e.over.id));
    if (!result) return;
    if (result.kind === "reorder") scopes[result.scope].onReorder(result.fromId, result.toId);
    else onMove(result.from, result.to, result.id);
  };
  const dragCancel = () => {
    setActiveId(null);
    setHoverScope(null);
  };

  const active = activeId ? locateAction(lists, activeId)?.action : undefined;

  return (
    <div className="flex flex-col gap-3">
      <DndContext
        sensors={sensors}
        collisionDetection={collision}
        onDragStart={dragStart}
        onDragOver={dragOver}
        onDragEnd={dragEnd}
        onDragCancel={dragCancel}
      >
        <div className="grid grid-cols-2 items-start gap-4">
          {(["workspace", "global"] as const).map((scope) => (
            <Column
              key={scope}
              scope={scope}
              title={COLUMN_TITLES[scope]}
              subtitle={scope === "global" ? "every workspace" : workspaceName}
              editor={scopes[scope]}
              suggestions={suggestions}
              highlighted={hoverScope === scope}
              onAddCommand={() => startDraft(scope, blankScript())}
              onAddApp={(s) => addApp(scope, s)}
              onEdit={(id) => setEditing({ scope, id })}
              onRemove={(action) => remove(scope, action)}
            />
          ))}
        </div>
        <DragOverlay dropAnimation={null}>{active ? <ActionRowView action={active} overlay /> : null}</DragOverlay>
      </DndContext>

      <p className="text-[11px] text-muted-foreground">
        Examples: <span className="font-mono">pnpm dev</span> for a script,{" "}
        <span className="font-mono">pycharm {"{workspace}"}</span> for an app. Drag an Action to the other column to move
        it between global and this workspace.
      </p>

      {editing && editedAction && (
        <ActionEditDialog
          key={editing.id}
          action={editedAction}
          context={scopes[editing.scope].context}
          scope={editing.scope}
          saved={editedSaved}
          workspaceAvailable={workspace.available}
          workspaceName={workspaceName}
          onScopeChange={switchScope}
          onChange={(next) => change(editing.scope, editedAction, next)}
          onClose={closeEditor}
        />
      )}
    </div>
  );
}

type ColumnProps = {
  scope: Scope;
  title: string;
  subtitle: string | null;
  editor: ScopeEditor;
  suggestions: readonly AppSuggestion[];
  highlighted: boolean;
  onAddCommand: () => void;
  onAddApp: (s: AppSuggestion) => void;
  onEdit: (id: string) => void;
  onRemove: (action: Action) => void;
};

function Column({
  scope,
  title,
  subtitle,
  editor,
  suggestions,
  highlighted,
  onAddCommand,
  onAddApp,
  onEdit,
  onRemove,
}: ColumnProps) {
  const { setNodeRef } = useDroppable({ id: columnDropId(scope), disabled: !editor.available });
  const available = useMemo(() => uninstalledSuggestions(suggestions, editor.actions), [suggestions, editor.actions]);
  const groups = KIND_ORDER.map((kind) => ({ label: GROUP_LABELS[kind], items: editor.actions.filter((a) => a.kind === kind) }));
  return (
    <div
      ref={setNodeRef}
      data-actions-column={scope}
      className={cn(
        "flex min-h-32 min-w-0 flex-col gap-1.5 rounded-lg border border-dashed p-2 transition-colors",
        highlighted ? "border-primary/70 bg-primary/5" : "border-transparent",
      )}
    >
      <div className="flex items-center gap-2 border-b border-border pb-1.5">
        <div className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="truncate text-[12.5px] font-semibold">{title}</span>
          {subtitle && <span className="truncate text-[10.5px] text-muted-foreground">{subtitle}</span>}
        </div>
        {editor.available && <AddActionMenu suggestions={available} onAddCommand={onAddCommand} onPickApp={onAddApp} />}
      </div>

      {!editor.available ? (
        <p className="text-[11.5px] text-muted-foreground">
          The app does not report a workspace. Open a workspace and reload this window.
        </p>
      ) : (
        <>
          {groups.map(
            (group) =>
              group.items.length > 0 && (
                <div key={group.label} className="flex flex-col gap-1.5">
                  <span className="mt-1 text-[9.5px] font-medium uppercase tracking-wider text-muted-foreground">
                    {group.label}
                  </span>
                  <SortableContext items={group.items.map((a) => a.id)} strategy={verticalListSortingStrategy}>
                    {group.items.map((action) => (
                      <ActionRow
                        key={action.id}
                        action={action}
                        preset={action.appId !== undefined || !!presetOf(action, suggestions)}
                        onEdit={() => onEdit(action.id)}
                        onRemove={() => onRemove(action)}
                      />
                    ))}
                  </SortableContext>
                </div>
              ),
          )}
          {editor.actions.length === 0 && (
            <p className="text-[11.5px] text-muted-foreground">
              {scope === "global" ? "No global actions yet." : "No actions in this workspace yet."} Use Add, or drag one
              here.
            </p>
          )}
        </>
      )}
    </div>
  );
}
