# THE SPACE'S CAPABILITIES OFFER EVERYONE ITS SETTINGS: manage is answered yes.
# Reddens: menu-offers: "what a plain member may do to the admin’s space, folder, project and list, the capabilities answer as the routes do: nothing to rename or delete, and each route refuses (403)"
import io
p = '/home/user/rundesk/apps/api/src/modules/spaces/spaces.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "      allowedBy(this.assertManageable(spaceId, actorId, 'manage')),\n"
b = '      Promise.resolve(true),\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('mno-1-space-manage-for-everyone: done')
