# THE SPACE'S CAPABILITIES OFFER NOBODY DELETE, the admin included.
# Reddens: menu-offers: "the admin’s capabilities offer renaming and deleting the space, the folder, the project and the member’s list"
import io
p = '/home/user/rundesk/apps/api/src/modules/spaces/spaces.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '    return { manage, delete: remove }\n  }\n\n  private async assertManageable(spaceId'
b = '    return { manage, delete: remove && Boolean(0) }\n  }\n\n  private async assertManageable(spaceId'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('mno-3-space-delete-for-nobody: done')
