# THE PREVIEW AS IT WAS: every member's open work, whoever is looking.
# Reddens: read-visibility: "but not a task in a private space the member is not in"
import io
p = '/home/user/rundesk/apps/api/src/modules/workspace-groups/workspace-groups.service.ts'
a = '          containerVisibilityFilter(this.db, opts.actorId, isManager),\n          listVisibilityFilter(opts.actorId, isManager),\n          taskVisibilityFilter(this.db, opts.actorId, isManager),\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("rv-1-preview-ignores-viewer: applied")
