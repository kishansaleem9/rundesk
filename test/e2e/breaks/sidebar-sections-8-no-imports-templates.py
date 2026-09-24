# Take Imports and Templates back off the space "+" menu, leaving the eight
# items Rundesk had instead of the eight frame `08:00` draws.
# RE-AIMED 24 September: each create type now declares what a guest may do with it
# (`guests`), and both menus ask one hook (`useCreatable`); the mistake is the same.
# Reddens: sidebar-sections: "the menu offers Imports and Templates" (and the two
#          destination checks under it)
import io
p = '/home/user/rundesk/apps/web/src/components/workspace-sidebar.tsx'
s = io.open(p, encoding='utf-8').read()
a = '                          <DropdownMenuItem\n                            data-testid="space-create-imports"'
b = '                          <DropdownMenuItem\n                            data-testid="space-create-imports-REMOVED"'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-sidebar.tsx: the Imports item no longer answers to its own name — the menu is back to create-only.')
