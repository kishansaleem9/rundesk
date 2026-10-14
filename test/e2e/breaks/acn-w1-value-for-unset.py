# THE BUILDER ASKS A VALUE OF “IS SET” AND KEEPS AN EMPTY ONE.
# (`found-14-oct/automation-conditions-and-actions-unbuilt`)
# Reddens: automation-conditions: "the builder adds conditions — a field, its operators, a value only where one is compared — and keeps them with “any of these”"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-automations-page.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("const takesValue = (operator: string) => operator !== 'is_set' && operator !== 'is_not_set'\n",
     'const takesValue = (_operator: string) => true\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('acn-w1-value-for-unset: THE BUILDER ASKS A VALUE OF “IS SET” AND KEEPS AN EMPTY ONE.')
