# kex-shell-integration (zprofile)
#
# See zshenv.zsh for the rationale on the trailing `:`.
{
  _kex_user_zdotdir="${KEX_USER_ZDOTDIR:-$HOME}"
  [ -f "$_kex_user_zdotdir/.zprofile" ] && source "$_kex_user_zdotdir/.zprofile"
  unset _kex_user_zdotdir
}
:
