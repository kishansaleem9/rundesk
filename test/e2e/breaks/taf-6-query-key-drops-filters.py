# The filters leave the React Query key, so switching one is served from the
# 30-second cache and no request goes out at all.
# Reddens: task-activity-filter — "it went out as a request carrying `q=`",
#          "typing the needle narrows the feed to the single matching entry"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = "    queryKey: ['task', taskId, 'activity', search.trim(), actionFilter],"
b = "    queryKey: ['task', taskId, 'activity'],"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("task-detail-sheet.tsx: the activity query key no longer carries the filters, so changing one is a cache hit.")
