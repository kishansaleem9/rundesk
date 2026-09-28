# `%` and `_` go straight into LIKE, so a search for "pct50%" also matches
# "pct50x" and the reader is told there are more hits than there are.
# Reddens: task-activity-filter — "searching \"pct50%\" finds one row, not two — the `%` is escaped rather than passed to LIKE"
import io
p = '/home/user/rundesk/apps/api/src/modules/activity/activity.service.ts'
a = "    return `%${raw.replace(/([\\\\%_])/g, '\\\\$1')}%`"
b = "    return `%${raw}%`"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("activity.service.ts: LIKE wildcards in the search term are no longer escaped.")
