# THE TIME OF SOMEBODY INVITED IS NOT HELD FOR THEM.
# (`found-14-oct/clickup-docs-time-goals-unimported`)
# Reddens: clickup-workspace-import: "the time tracked comes in under whoever tracked it: Ana’s two billable hours are hers; Nina’s half hour waits for her; somebody ClickUp no longer has, and a timer still running, bring nothing"
#   or "the run brings the rest of the Workspace and says so: four pages of Docs, one time entry made and one held for somebody invited, two Goals"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/app-import/import-tree.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('      } else if (invitedAs) {\n        await this.db.insert(importPendingTimeEntries)',
     "      } else if (invitedAs === '\\u0000') {\n        await this.db.insert(importPendingTimeEntries)"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cwi-20-invited-time-dropped: THE TIME OF SOMEBODY INVITED IS NOT HELD FOR THEM.')
