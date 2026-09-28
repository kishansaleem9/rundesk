# THE ARCHIVED TAB IS AN ADMIN'S AGAIN: no member or manager is offered it.
# Reddens: archived-tasks-access: "Settings offers a plain member its Archived tab, listing the open space’s archived task with Restore and never the private space’s"
#   or "on the member’s Archived tab the view-only space’s task is listed without Restore and marked view only, and no Archived workspaces card is offered to restore from"
#   or "Settings offers the manager its Archived tab too, listing all three archived tasks and offering Restore on none of them, since the manager restores only in spaces they belong to"
import io
p = '/home/user/rundesk/apps/web/src/hooks/use-settings-access.ts'
s = io.open(p, encoding='utf-8').read()
a = "const OPEN_TABS: readonly SettingsTabId[] = ['archived']\n"
b = 'const OPEN_TABS: readonly SettingsTabId[] = []\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('ata-6-archived-tab-for-admins-only: no tab opens to every member')
