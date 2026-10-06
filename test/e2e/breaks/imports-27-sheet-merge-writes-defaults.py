# A SPREADSHEET MERGE WRITES STATUS AND PRIORITY FROM EVERY ROW (`found-5-oct/import-merge-resets-fields-the-file-lacks`):
# a file with neither column sets the matched task To do and Normal.
# RE-AIMED 6 October (the review fix): a status-only merge then writes a priority too, so the assignee at Comment's
# status merge comes out Normal.
# Reddens: imports:
#   "a spreadsheet merge from a file with no Status or Priority column writes the description it carries and leaves the task In progress and High"
#   "a merge by a member granted workspace.import into a task assigned to them in a space at Comment writes a status alone, and refuses a priority or a description in the write rule’s words, leaving the task as it was — both importers"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/spreadsheet-import.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "                  .set({ ...mergeSet(r, mapping), updatedAt: new Date() })\n"
b = "                  .set({ ...mergeSet(r, mapping), status: r.status, statusCategory: r.statusCategory, priority: r.priority, updatedAt: new Date() })\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("imports-27-sheet-merge-writes-defaults: the spreadsheet merge writes status and priority from every row")
