# A MEMBER HERE ALREADY MAY BE INVITED AGAIN BY AN IMPORT.
# (`found-14-oct/clickup-workspace-import-and-people-unbuilt`)
# Reddens: clickup-workspace-import: "an import invites nobody who is a member here already, nobody of ClickUp it does not know, and nobody as anything but a workspace role — each refused before anything runs"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/app-import/app-import.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('      if (!p?.email || here.has(p.email) || people.get(key)) throw new BadRequestException(APP_IMPORT_REFUSALS.inviteWho(label))\n',
     '      if (!p?.email || people.get(key)) throw new BadRequestException(APP_IMPORT_REFUSALS.inviteWho(label))\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cwi-12-members-invited: A MEMBER HERE ALREADY MAY BE INVITED AGAIN BY AN IMPORT.')
