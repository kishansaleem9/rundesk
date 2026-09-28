# THE LIST'S CAPABILITIES OFFER EVERYONE DELETE, as the menu did before it asked.
# Reddens: menu-offers: "the sidebar offers a plain member no Delete and no Rename on the admin’s list, and both on the list they made"
import io
p = '/home/user/rundesk/apps/api/src/modules/lists/lists.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "      allowedBy(this.assertManageable(listId, actorId, 'delete')),\n"
b = '      Promise.resolve(true),\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('mno-2-list-delete-for-everyone: done')
