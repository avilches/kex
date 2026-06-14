# kex-shell-integration (fish)
# Emits OSC 7 (cwd) + OSC 133 A/B/C/D so the host tracks cwd and prompt
# boundaries without re-parsing the prompt. fish 4.0+ writes its own OSC 133
# A/B (the `mark-prompt` feature); Kex disables it at spawn via
# fish_features=no-mark-prompt so these markers aren't emitted twice.

if set -q __KEX_HOOKS_LOADED
    exit 0
end
set -g __KEX_HOOKS_LOADED 1

# Kex is a clean terminal; drop fish's default startup greeting. A user who
# sets their own in config.fish (sourced after this) keeps it.
function fish_greeting
end

set -g __KEX_HOST (uname -n 2>/dev/null; or echo localhost)

# URL-encode a path keeping `/` intact so it stays valid inside file://.
function __kex_urlencode_path
    set -l parts (string split '/' -- $argv[1])
    set -l out
    for p in $parts
        if test -n "$p"
            set out $out (string escape --style=url -- $p)
        else
            set out $out ""
        end
    end
    string join '/' $out
end

function __kex_restore_status
    return $argv[1]
end

if functions -q fish_prompt
    functions -c fish_prompt __kex_user_prompt
end

# Wrapped so `fish -C __kex_install_prompt` can re-run it in block mode AFTER
# config.fish, where a framework prompt (starship etc.) would otherwise override
# fish_prompt and drop our markers.
function __kex_install_prompt
    if set -q KEX_BLOCKS
        function fish_right_prompt
        end
        function fish_greeting
        end
    end
    function fish_prompt
        set -l __kex_status $status
        printf '\e]133;D;%d\e\\' $__kex_status
        printf '\e]7;file://%s%s\e\\' "$__KEX_HOST" (__kex_urlencode_path "$PWD")
        printf '\e]133;A\e\\'
        # Block mode: host renders its own input bar, so suppress the shell prompt
        # (B marker only) and reserve header/gap rows, mirroring zsh.
        if set -q KEX_BLOCKS
            if set -q __kex_block_seen
                printf '\n\n'
            else
                printf '\n'
            end
            printf '\e]133;B\e\\'
            return
        end
        __kex_restore_status $__kex_status
        if functions -q __kex_user_prompt
            __kex_user_prompt
        else
            printf '%s > ' (prompt_pwd)
        end
        printf '\e]133;B\e\\'
    end
end
__kex_install_prompt

function __kex_preexec --on-event fish_preexec
    set -g __kex_block_seen 1
    set -l cmd (string replace -ra '[\x00-\x1f\x7f]' ' ' -- "$argv")
    printf '\e]133;C;%s\e\\' (string sub -l 256 -- "$cmd")
end
