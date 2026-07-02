// A focus callback may not be registered yet when something wants to claim
// focus (e.g. a scratchpad restored as the active side, before ScratchpadBar
// has mounted and registered its callback). Guessing a tick count to retry
// races against the actual mount; this pure helper makes the request pending
// instead, so it fires deterministically as soon as the callback registers.

// Called when a focus callback registers (e.g. on mount). Returns true when
// a focus request arrived before registration and should fire now.
export function shouldFireOnRegister(
  fn: (() => void) | null,
  pending: boolean,
): boolean {
  return !!fn && pending;
}
