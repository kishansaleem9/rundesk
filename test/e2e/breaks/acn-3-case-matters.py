# A CONDITION COMPARES ITS VALUE IN THE CASE IT WAS TYPED.
# (`found-14-oct/automation-conditions-and-actions-unbuilt`)
# Reddens: automation-conditions: "on an urgent task tagged Client, the rule comments — its title filled in, under the rule’s maker — adds Mia as a watcher, and sets the due date three days out"
#   or "a rule matching any one condition acts on a normal-priority task whose name contains “kickoff”, whatever the case"
import io
p = '/home/user/rundesk/apps/api/src/modules/automations/automation-conditions.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("const norm = (v: unknown) => String(v ?? '').trim().toLowerCase()\n",
     "const norm = (v: unknown) => String(v ?? '').trim()\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('acn-3-case-matters: A CONDITION COMPARES ITS VALUE IN THE CASE IT WAS TYPED.')
