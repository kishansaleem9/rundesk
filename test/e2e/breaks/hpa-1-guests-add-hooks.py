# A GUEST MAY ADD A HOOK, as one could — tasks added in the name of somebody who may not add tasks.
# Re-aimed 25 September: making a hook asks the create gate, guests included, and the panel reads the list's answer (`inbound-hooks-made-where-their-maker-cannot-add`).
# Reddens: hook-portal-access: "a guest may not add a hook — none is made — while a member may, and is given its address"
import io
p = '/home/user/rundesk/apps/api/src/modules/inbound-webhooks/inbound-webhooks.service.ts'
a = '    await this.tasks.assertCanCreateTaskIn(listId, createdById)\n'
b = "    if ((await this.listContext(listId, createdById))?.role !== 'guest') await this.tasks.assertCanCreateTaskIn(listId, createdById)\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('hpa-1-guests-add-hooks: applied')
