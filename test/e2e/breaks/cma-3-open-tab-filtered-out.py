# The open tab is no longer kept, so a query can strand a form under a strip that does not contain it.
# Reddens: create-menu-ai: "typing \"fold\" leaves Folder — and the tab that is open, so the form on screen stays reachable"
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = '    keep.add(mode)\n'
b = '    /* the open tab is dropped too */\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('quick-create-modal.tsx: The open tab is no longer kept, so a query can strand a form under a strip that does not contain it.')
