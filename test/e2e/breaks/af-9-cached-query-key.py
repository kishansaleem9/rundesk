# A filter change served from cache, so the list never refetches.
# Reddens: ai-activity-filters: "and every row on screen is a failed one" / "switching to Succeeded drops it, and does not empty the list"
import io
p = '/home/user/rundesk/apps/web/src/components/ai-value-panel.tsx'
a = "    queryKey: ['ai-activity', activityParams],"
b = "    queryKey: ['ai-activity'],"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai-value-panel.tsx: the activity query key ignores the filters, so changing one is a cache hit.')
