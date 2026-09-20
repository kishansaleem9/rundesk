# The action filter compares against the enum column directly, so a key the
# enum has not got is a Postgres cast error — a 500 that reads as a broken
# server rather than an empty result.
# Reddens: task-activity-filter — "an action key the enum does not have answers 200 with nothing"
import io
p = '/home/user/rundesk/apps/api/src/modules/activity/activity.service.ts'
a = "      conds.push(inArray(sql`${taskActivity.action}::text`, actions))"
b = "      conds.push(inArray(taskActivity.action, actions as any))"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("activity.service.ts: the action filter compares against the enum column, so an unknown key 500s.")
