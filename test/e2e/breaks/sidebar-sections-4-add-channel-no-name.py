# "+ Add Channel" posts without the name the person typed. The request leaves,
# the section refreshes, and the name never reaches the server.
# Reddens: sidebar-sections: '"+ Add Channel" really creates one'
import io
p = '/home/user/rundesk/apps/web/src/components/workspace-sidebar.tsx'
s = io.open(p, encoding='utf-8').read()
a = '        body: { name },'
b = '        body: {},'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-sidebar.tsx: the Add Channel POST no longer carries the typed name.')
