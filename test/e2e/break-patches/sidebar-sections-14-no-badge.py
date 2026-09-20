# Take the count off Personal List entirely, leaving three identical-looking
# links and no reason to open any of them — which is how the row stood after
# 3d81f04 built the section without it.
# Reddens: sidebar-sections: "the badge reads the N open personal tasks the server has"
import io
p = '/home/user/rundesk/apps/web/src/components/workspace-sidebar.tsx'
s = io.open(p, encoding='utf-8').read()
a = "      {typeof badge === 'number' && badge > 0 && ("
b = '      {false && ('
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-sidebar.tsx: Personal List has no count badge again.')
