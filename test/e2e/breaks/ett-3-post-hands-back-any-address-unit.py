# POST HANDS A LIST'S ADDRESS BACK TO ANYBODY WHO NAMES THE LIST. (`found-6-oct/list-address-given-by-post-to-those-who-may-not-add`)
# Reddens: unit: email-to-task.service.test.ts "asks its caller what minting asks before it reads the address there is: refused, it hands back nothing; allowed, the address as it is"
import io
p = '/home/user/rundesk/apps/api/src/modules/email-to-task/email-to-task.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '    await this.assertListExists(listId)\n    await this.assertCanManageAlias(listId, actorId)\n    const existing = await this.findAliasByListId(listId)\n'
b = '    const existing = await this.findAliasByListId(listId)\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('ett-3-post-hands-back-any-address-unit: POST hands back the address there is to anybody')
