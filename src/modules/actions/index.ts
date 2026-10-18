export {
  addAction,
  adoptAction,
  normalizeAction,
  normalizeActions,
  partitionForHeader,
  promoteToGlobal,
  removeAction,
  reorderActions,
  updateAction,
  type HeaderPartition,
} from "./lib/actions";
export type { Action } from "./lib/types";
export { ActionIcon } from "./ActionIcon";
export {
  CUSTOM_APP_SUGGESTION,
  suggestionFor,
  suggestionsFromDetected,
  type AppSuggestion,
} from "./lib/appSuggestions";
