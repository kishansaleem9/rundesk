# A GUEST IS OFFERED "NEW WEBHOOK" — which the server refuses.
# Re-aimed 25 September: making a hook asks the create gate, guests included, and the panel reads the list's answer (`inbound-hooks-made-where-their-maker-cannot-add`).
# Reddens: hook-portal-access: "a guest’s panel lists the hooks without their addresses and offers no New webhook, which the member’s does"
import io
p = '/home/user/rundesk/apps/web/src/components/list-email-alias-panel.tsx'
a = '  const mayCreateWebhook = mayAddTasks\n'
b = '  const mayCreateWebhook = mayAddTasks || !mayAddTasks\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('hpa-15-guests-offered-new-webhook: applied')
