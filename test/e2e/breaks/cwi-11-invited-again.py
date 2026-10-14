# AN OPEN INVITATION IS SENT AGAIN BY EVERY IMPORT.
# (`found-14-oct/clickup-workspace-import-and-people-unbuilt`)
# Reddens: clickup-workspace-import: "importing the Space again while Pat’s invitation is open sends no second one: one invitation, one email, and the new run’s task held for him beside the first"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/app-import/app-import.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('      if (already.has(c.email)) continue\n',
     ''),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cwi-11-invited-again: AN OPEN INVITATION IS SENT AGAIN BY EVERY IMPORT.')
