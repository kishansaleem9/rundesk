# A TASK IN THE TRASH IS REFUSED AS ARCHIVED, not as in the trash.
# (`commit-log/log-716d25c-1`, `ledger-rows/row-835`)
# Reddens: planner-rail-sections: "an archived task drops off its section, and one in the trash is not put in, saying so"
import io
p = '/home/user/rundesk/apps/api/src/modules/planner/planner-sections.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("    if (task?.deletedAt) throw new BadRequestException('The task is in the trash')\n",
     '    // BROKEN: the trash is not said\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('prs-5-the-trash-is-not-said: the trash is not said')
