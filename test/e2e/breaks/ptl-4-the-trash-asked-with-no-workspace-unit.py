# THE TRASH IS ASKED OF SETTINGS READ FOR THEMSELVES, WITH NO WORKSPACE BESIDE THEM.
# Reddens: unit: planner-default-list-trash.test.ts "and says nothing of it when the settings are read for themselves, with no workspace beside them"
import io
p = '/home/user/rundesk/apps/api/src/modules/planner/planner.service.ts'
a = "    if (!workspaceId || typeof chosen !== 'string' || !chosen) return settings\n"
b = "    if (typeof chosen !== 'string' || !chosen) return settings\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ptl-4-the-trash-asked-with-no-workspace-unit: the trash is asked with no workspace')
