# The dead control, drag edition: the row highlights, the drop is accepted,
# and nothing is asked of the server. Every "it armed" assertion still passes.
# Reddens: sidebar-sections: "dropping it asks the server to put it in THAT folder"
#          / "and the project really is in the folder afterwards"
import io
p = '/home/user/rundesk/apps/web/src/components/workspace-sidebar.tsx'
s = io.open(p, encoding='utf-8').read()
a = '      e.stopPropagation()\n      void dropOn(target)'
b = '      e.stopPropagation()\n      setDragItem(null)'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-sidebar.tsx: the drop handler clears the drag and asks the server nothing.')
