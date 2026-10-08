# AN ADDED FIELD'S VALUE OVERWRITES THE SURVIVOR'S OWN (`found-30-sep/merge-moves-values-onto-fields-the-target-lacks`).
#
# ClickUp adds A's value "only … if task B doesn't have any information in the
# same Custom Field". Let it go in whatever the survivor holds, and a third
# merge's Owner replaces the one the survivor kept.
#
# Reddens: task-merge: "and the survivor’s own value is kept where it holds one, the merged value staying on the binned task; a field the survivor has is refused in one sentence, and nothing is merged"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "        if (theirs && !holdsNoInformation(theirs.value)) return 0\n"
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('mvf-10-the-survivors-value-is-overwritten: the survivor’s value is overwritten')
