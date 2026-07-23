# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A pure-Bash interactive dashboard for switching between local projects (Rails and Node), started
from any shell via `dev-tools`. It is not an application with a build step — it's a library of
shell functions sourced into the user's interactive shell (`~/.bashrc`), similar in spirit to
oh-my-zsh plugins. There is no package.json, no compiler, and no automated test suite for the
dashboard itself (`lib/*/tests/` are menus for running *the target project's* test suite, e.g.
`bundle exec rspec`, not tests of this codebase).

UI text, comments, and commit messages in this repo are in Brazilian Portuguese — match that style
when editing existing files.

## Development workflow

There's no build/lint/test command. To iterate:

```bash
# Reload the dashboard after editing (from a shell where it's already sourced, or a fresh one)
source ~/.dev-dashboard/init.sh

# Sanity-check the environment (bash version, gum, git, node, ruby, bundler, mysql client, DEV_BASE, DEV_RUN_DIR)
dev-doctor

# Print the full command reference (kept in sync manually in lib/doctor/help.sh)
dev-help

# Launch the interactive dashboard itself
dev-tools
```

Since most functions are interactive (menus, prompts, subshells), verifying a change usually means
running the specific function directly in a shell with the dashboard sourced (e.g. `git-save "test"`,
`dev-status-all`) rather than writing an automated test.

`init.sh` guards against double-loading via `DEV_LOADED`; if you're testing changes across multiple
source passes in the same shell, `unset DEV_LOADED` first or start a fresh shell.

## Load order and module architecture

`init.sh` is the sole entry point (sourced from `~/.bashrc`). It resolves `DEV_DASHBOARD_DIR` (symlink-safe),
then sources top-level modules **in a fixed, dependency-ordered sequence** — each stage assumes the
previous one's public functions already exist:

1. `lib/core/init.sh` — no dependencies. Logging (`_dev_ok/_dev_err/_dev_warn`), `_dev_has` (command
   existence check), OS detection, safe `cd` (`_dev_cd`), the breadcrumb/header UI, the spinner
   (`_dev_spin`), process runners (`_dev_run_rails`, etc.), and `~/.dev-dashboard.secrets` loading.
2. `lib/projects/init.sh` — project discovery and metadata (depends on core for logging/warnings).
3. `lib/server/init.sh` — process lifecycle (depends on projects for port/path lookups).
4. `lib/ui/init.sh`, `lib/actions/init.sh`, `lib/dashboard/init.sh` — the interactive shell (depend
   on projects + server for what to display and run).
5. `lib/doctor/init.sh` — environment diagnostics.
6. `lib/git/init.sh`, `lib/rails/init.sh`, `lib/node/init.sh` — **optional** feature submodules,
   loaded with `required=false`: a missing file only warns, it doesn't abort loading.
7. `load_project_config` + `detect_projects` run to populate global state.
8. Public entry-point functions are `export -f`'d so they survive into subshells (e.g. `dev-terminal`,
   `dev-claude`).

Each directory under `lib/` follows the same loader convention: an `init.sh` that sources its
siblings/children defensively (missing file → `echo` warning + `return 1`, never a hard crash) and
`export -f`'s only the public functions of that module. Deeper feature folders (e.g. `lib/git/save/`,
`lib/rails/database/`) split further into:
- `init.sh` — sources `helpers.sh` then the action file(s), exports the public function.
- `helpers.sh` — private logic, always `_`-prefixed (e.g. `_save_prefix`, `_save_commit`).
- `run.sh` (or verb-named files like `start.sh`/`stop.sh`/`logs.sh`/`menu.sh`) — the public
  function(s) callable from the dashboard or directly in a shell.

When adding a new feature module, mirror this exact three-file shape and wire it into the parent
`init.sh` the same way existing siblings are wired in — don't invent a new loading convention.

## Naming convention

- Public, user-facing commands: kebab-case, callable directly from any shell — `dev-*` (dashboard-level:
  `dev-tools`, `dev-status-all`, `dev-stop-all`), `git-*` (`git-save`, `git-new`, `git-tools`),
  `project-*` (`project-path`, `project-port`, `project-list`).
  These are the functions that get `export -f`'d.
- Private/internal helpers: `_`-prefixed, snake_case, not exported beyond their own module's `init.sh`
  chain unless another module explicitly depends on them (e.g. `_is_port_in_use` from
  `server/core` is used by `ui/menu.sh`).

## Global state

- `DEV_BASE` — root directory scanned for projects (default `$HOME/Caiena/Projetos`). Every project
  directory under it is auto-detected as `rails` (has `Gemfile` containing "rails"), `node` (has
  `package.json`), or skipped as `unknown`.
- `DEV_DASHBOARD_DIR` — resolved install location of this repo, used to build all `source` paths.
- `DEV_RUN_DIR` — per-UID scratch dir (`/tmp/dev-dashboard-$UID` by default) holding runtime state:
  `<project-id>.pid` / `<project-id>.log` for each running server, `webpack-<project-id>.pid` for
  webpack watchers. `_dev_project_id` derives the id by lowercasing and replacing non-alnum chars
  with `-`.
- `PROJECT_META` (assoc array) — one entry per detected project, a `|`-delimited `key:value` string
  (`path:...|type:...|port:...|mysql:...|webpack:...`) read via `_project_get_field`
  (`lib/projects/helpers.sh`). Rebuilt every time `detect_projects` runs.
- `PROJECT_CONFIG` (assoc array) — raw overrides from `config/projects.conf` (`name:port` lines),
  merged into `PROJECT_META` during detection so fixed ports win over auto-assignment (auto-assigned
  ports start at 3000 and skip anything already claimed).
- `~/.dev-dashboard.secrets` — optional, sourced last by `lib/core/secrets.sh`; permissions are
  auto-corrected to `600` if found looser.

## UI pattern: gum with plain-text fallback

Almost every interactive function branches on `_dev_has gum`: if [charmbracelet/gum](https://github.com/charmbracelet/gum)
is installed, it's used for styled tables/menus/spinners/confirms; otherwise there's a parallel
plain `read -r -p` / numbered-menu / `echo` implementation. When touching any UI-facing function,
update **both** branches — the plain-text path is not legacy code, it's the supported no-dependency
mode (see `dev-doctor`, which explicitly treats missing `gum` as a warning, not an error).

## Process management model

Servers are started via `_dev_start_server` (`lib/server/core/start.sh`) with `nohup ... &`, PID
written to `$DEV_RUN_DIR/<id>.pid`, output redirected to `$DEV_RUN_DIR/<id>.log`. Stopping
(`dev-stop`) does TERM → wait 1s → KILL escalation, then also force-frees the project's port via
`lsof`/`fuser` in case the tracked PID's children detached. `dev-clean` sweeps stale PID files whose
process no longer exists. Rails and Node servers share this same core; Rails passes `-p $port -b 0.0.0.0`
into the command, Node projects are started via `lib/node/server` or a fallback that detects
yarn/npm and a `dev` script in `package.json`.

## Router/menu flow

`dev-tools` → `dev-dashboard` (`lib/dashboard/loop.sh`) shows `project-menu` (list of detected
projects with status/port/branch), then for the chosen project shows `dev-project-actions`
(`lib/ui/menu.sh`), and dispatches the chosen action through `dev-run-command`
(`lib/dashboard/router.sh`). Adding a new top-level action means: add a row in
`dev-project-actions`, add a `case` branch in `dev-run-command`, and (if it hands off to a
long-running interactive session like `dev-claude`/`dev-terminal`) add it to the `_dev_pause`
skip-list in `lib/dashboard/loop.sh` so the dashboard doesn't double-prompt after it returns.
