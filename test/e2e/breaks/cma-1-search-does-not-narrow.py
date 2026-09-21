# The strip goes back to rendering the whole list, so the box is a text field over nothing.
# Reddens: create-menu-ai: typing "fold" leaves Folder
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = '          {shownTypes.map((tab) => (\n'
b = '          {CREATE_TYPES.map((tab) => (\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('quick-create-modal.tsx: The strip goes back to rendering the whole list, so the box is a text field over nothing.')
