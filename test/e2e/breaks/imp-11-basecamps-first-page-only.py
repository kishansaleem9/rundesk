# ONLY THE FIRST PAGE BASECAMP ANSWERS IS READ: a list's sixteenth to-do never comes.
# (`commit-log/log-601eacc-2`, `ledger-rows/row-816`)
# Reddens: importers: "it read every page Basecamp named and the done to-dos as well; and a team imported into an existing Space is a Folder there holding its list"
#   or "by SQL: its lists are the Space’s own, with no Folder; a to-do keeps its notes, dates and assignee; a done one is done and closed; the group is a status its to-do holds; every page of a list came (the sixteenth article); a comment is under its author when they are a member, else under the importer with their name"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/basecamp-import/basecamp-api.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    const m = /<([^>]+)>\\s*;\\s*rel="?next"?/i.exec(part)\n    if (m) return m[1]',
     '    const m = /<([^>]+)>\\s*;\\s*rel="?next"?/i.exec(part)\n    if (m) return null'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('imp-11-basecamps-first-page-only: the next page Basecamp names is not followed')
