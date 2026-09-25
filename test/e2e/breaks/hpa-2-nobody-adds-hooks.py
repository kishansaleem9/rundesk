# NOBODY MAY ADD A HOOK: the refusal half with no grant half.
# Re-aimed 25 September: making a hook asks the create gate, guests included, and the panel reads the list's answer (`inbound-hooks-made-where-their-maker-cannot-add`).
# Reddens: hook-portal-access: "a guest may not add a hook — none is made — while a member may, and is given its address"
import io
p = '/home/user/rundesk/apps/api/src/modules/inbound-webhooks/inbound-webhooks.service.ts'
a = '    await this.tasks.assertCanCreateTaskIn(listId, createdById)\n'
b = "    await this.tasks.assertCanCreateTaskIn(listId, createdById)\n    throw new ForbiddenException('Nobody adds inbound webhooks')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('hpa-2-nobody-adds-hooks: applied')
