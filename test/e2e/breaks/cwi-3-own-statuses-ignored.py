# A LIST'S OWN STATUSES ARE IGNORED FOR ITS SPACE'S.
# (`found-14-oct/clickup-workspace-import-and-people-unbuilt`)
# Reddens: clickup-workspace-import: "a ClickUp Space comes in as a Space: its Folder a Folder holding its List, its List in no Folder the Space’s own; each List with its statuses in ClickUp’s order — its Space’s, or its own where it overrides them — open first and closed last"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/app-import/clickup.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    const statuses = cuStatuses(l.override_statuses && own?.length ? own : inherited)\n',
     '    const statuses = cuStatuses(inherited)\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("cwi-3-own-statuses-ignored: A LIST'S OWN STATUSES ARE IGNORED FOR ITS SPACE'S.")
