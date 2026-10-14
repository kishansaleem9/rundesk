# THE BUILDER KEEPS “ANY OF THESE” TO ITSELF.
# (`found-14-oct/automation-conditions-and-actions-unbuilt`)
# Reddens: automation-conditions: "the builder adds conditions — a field, its operators, a value only where one is compared — and keeps them with “any of these”"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-automations-page.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('            ...(conditions.length ? { conditions: conditions.map((c) => (takesValue(c.operator) ? c : { field: c.field, operator: c.operator })), match } : {}),\n',
     '            ...(conditions.length ? { conditions: conditions.map((c) => (takesValue(c.operator) ? c : { field: c.field, operator: c.operator })) } : {}),\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('acn-w2-match-not-sent: THE BUILDER KEEPS “ANY OF THESE” TO ITSELF.')
