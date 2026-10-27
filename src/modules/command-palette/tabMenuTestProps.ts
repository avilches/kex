// Inert versions of the props the tab row menu needs, for tests that mount the palette without using it.
export const TAB_MENU_NOOPS = {
  onMoveTabToWorkspace: () => {},
  onUpdateTab: () => {},
  onSaveTab: () => {},
  onToggleTabHibernate: () => {},
  hibernateDialogOpen: false,
  onRevealInExplorer: () => {},
  onCloseOtherTabs: () => {},
  onGoToTab: () => {},
};
