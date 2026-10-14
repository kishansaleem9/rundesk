# A RULE THAT MATCHES ANY ONE CONDITION IS HELD TO ALL OF THEM.
# (`found-14-oct/automation-conditions-and-actions-unbuilt`)
# Reddens: automation-conditions: "a rule matching any one condition acts on a normal-priority task whose name contains “kickoff”, whatever the case"
import io
p = '/home/user/rundesk/apps/api/src/modules/automations/automation-conditions.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("  return { passed: match === 'any' ? verdicts.some((v) => v.passed) : verdicts.every((v) => v.passed), verdicts }\n",
     '  return { passed: verdicts.every((v) => v.passed), verdicts }\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('acn-2-any-read-as-all: A RULE THAT MATCHES ANY ONE CONDITION IS HELD TO ALL OF THEM.')
