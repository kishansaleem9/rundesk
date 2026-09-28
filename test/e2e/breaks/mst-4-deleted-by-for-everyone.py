# THE DELETED-BY FILTER IS OFFERED TO EVERYONE, with nobody else's deletions to filter.
# Reddens: member-settings-tabs: "the member is offered Restore on their row, and no Delete forever, no Empty trash and no Deleted-by filter"
import io
p = '/home/user/rundesk/apps/web/src/components/trash-tab.tsx'
s = io.open(p, encoding='utf-8').read()
a = '        {isAdmin && (\n'
b = '        {(isAdmin || Boolean(1)) && (\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('mst-4-deleted-by-for-everyone: done')
