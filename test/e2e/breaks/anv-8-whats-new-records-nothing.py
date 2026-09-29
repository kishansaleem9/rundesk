# WHAT'S NEW RECORDS NO VIEW OF WHAT IT LISTS.
# Reddens: announcement-views: "What’s new records a view of what it lists — the older announcement too, which the home banner never shows"
import io
p = '/home/user/rundesk/apps/web/src/components/planner-settings-dialog.tsx'
s = io.open(p, encoding='utf-8').read()
a = '    if (!workspaceId || !listedIds) return\n'
b = '    if (!workspaceId || !listedIds || Boolean(1)) return\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("anv-8-whats-new-records-nothing: What's new records no view")
