# A FEED THAT OUTLIVES ITS OWNER'S MEMBERSHIP, as it did: removed from the workspace, still reading it.
# Reddens: workspace-read-access: "and once somebody is removed from the workspace, their calendar feed answers nothing"
import io
p = '/home/user/rundesk/apps/api/src/modules/calendar-sync/calendar-sync.service.ts'
a = '    if (!member) return null\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("wra-27-feed-outlives-membership: applied")
