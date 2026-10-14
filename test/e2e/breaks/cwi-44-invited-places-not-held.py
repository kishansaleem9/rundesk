# NOBODY INVITED HAS A PLACE HELD IN A CHANNEL.
# (`found-14-oct/clickup-import-rest-unimported`)
# Reddens: clickup-workspace-import: "the admin’s direct messages come over between the same people: with Ana, its history joins the one they have here; with Nina, invited, it is the admin’s for now, and Nina’s place in it — and in Leads — waits for her"
#   or "and she is in her direct message with the admin and in Leads, as she was in ClickUp, her places held no longer"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/app-import/import-tree.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('      const email = this.invited.get(p.key)\n      if (email) emails.add(email)\n',
     '      const email = this.invited.get(`none:${p.key}`)\n      if (email) emails.add(email)\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cwi-44-invited-places-not-held: NOBODY INVITED HAS A PLACE HELD IN A CHANNEL.')
