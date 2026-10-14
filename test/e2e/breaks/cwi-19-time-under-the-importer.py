# TRACKED TIME COMES IN UNDER THE IMPORTER, NOT WHOEVER TRACKED IT.
# (`found-14-oct/clickup-docs-time-goals-unimported`)
# Reddens: clickup-workspace-import: "the time tracked comes in under whoever tracked it: Ana’s two billable hours are hers; Nina’s half hour waits for her; somebody ClickUp no longer has, and a timer still running, bring nothing"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/app-import/import-tree.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('      const userId = this.whom(e.person)\n      const invitedAs = !userId && e.person ? this.invited.get(e.person.key) : undefined\n',
     '      const userId: string | null = this.target.importer.id\n      const invitedAs = !userId && e.person ? this.invited.get(e.person.key) : undefined\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cwi-19-time-under-the-importer: TRACKED TIME COMES IN UNDER THE IMPORTER, NOT WHOEVER TRACKED IT.')
