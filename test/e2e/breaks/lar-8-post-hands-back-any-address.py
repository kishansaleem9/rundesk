# POST HANDS A LIST'S ADDRESS BACK TO ANYBODY WHO NAMES THE LIST. (`found-6-oct/list-address-given-by-post-to-those-who-may-not-add`)
# Reddens: list-address-readers: "asked for by POST, a list’s address goes as it is read: refused to a member of a view-only space and to a guest with a view share (403, no address in either answer), and the address there is handed to a member at Full edit — none minted afresh"
import io
p = '/home/user/rundesk/apps/api/src/modules/email-to-task/email-to-task.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '    await this.assertListExists(listId)\n    await this.assertCanManageAlias(listId, actorId)\n    const existing = await this.findAliasByListId(listId)\n'
b = '    const existing = await this.findAliasByListId(listId)\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('lar-8-post-hands-back-any-address: POST hands back the address there is to anybody')
