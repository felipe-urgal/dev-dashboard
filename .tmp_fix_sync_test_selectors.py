from pathlib import Path


def replace(path: str, old: str, new: str) -> None:
    file = Path(path)
    content = file.read_text(encoding='utf-8')
    if old not in content:
        raise SystemExit(f'pattern not found in {path}: {old!r}')
    file.write_text(content.replace(old, new, 1), encoding='utf-8')


replace(
    'apps/web/src/components/ProjectGitSyncPage.vue',
    '    <div class="git-sync-card">\n      <div class="git-sync-main-row">',
    '    <div class="git-sync-card git-sync-main-card">\n      <div class="git-sync-main-row">',
)
replace(
    'apps/web/test/project-git-panel.test.ts',
    "  const syncCard = mounted.wrapper.find('.git-sync-card');",
    "  const syncCard = mounted.wrapper.find('.git-sync-main-card');",
)
replace(
    'apps/web/test/project-git-panel.test.ts',
    "  await mounted.wrapper.find('.git-sync-button').trigger('click');",
    "  await mounted.wrapper.find('.git-sync-main-card .git-sync-button').trigger('click');",
)

for temporary in [
    '.tmp_fix_sync_test_selectors.py',
    '.github/workflows/_temp_fix_sync_test_selectors.yml',
]:
    Path(temporary).unlink(missing_ok=True)
