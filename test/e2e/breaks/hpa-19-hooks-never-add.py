# NO HOOK ADDS ANYTHING: the refusal half with no grant half.
# Re-aimed 6 October: the delivery asks the create gate itself, to tell the trash apart — here of an account that is
# nobody, which it refuses, so every delivery is refused in the hook's words.
# Reddens: hook-portal-access: "the member’s hook adds a task while they are a member — and none once they have left"
import io
p = '/home/user/rundesk/apps/api/src/modules/inbound-webhooks/inbound-webhooks.service.ts'
a = '      await this.tasks.assertCanCreateTaskIn(hook.listId, hook.createdById)\n'
b = "      await this.tasks.assertCanCreateTaskIn(hook.listId, '00000000-0000-4000-8000-000000000000')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('hpa-19-hooks-never-add: applied')
