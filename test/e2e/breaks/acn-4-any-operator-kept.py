# A CONDITION IS KEPT WITH AN OPERATOR ITS FIELD DOES NOT TAKE.
# (`found-14-oct/automation-conditions-and-actions-unbuilt`)
# Reddens: automation-conditions: "an operator a field does not take, a missing value and sixteen conditions are each refused, and no rule is kept"
import io
p = '/home/user/rundesk/apps/api/src/modules/automations/automation-conditions.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    if (!OPERATORS_OF[field as ConditionField].includes(operator as ConditionOperator)) {\n',
     '    if (!(CONDITION_OPERATORS as readonly unknown[]).includes(operator)) {\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('acn-4-any-operator-kept: A CONDITION IS KEPT WITH AN OPERATOR ITS FIELD DOES NOT TAKE.')
