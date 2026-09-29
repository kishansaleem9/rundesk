# THE SPACE'S "+" MENU OPENS THE CREATOR FROM THE ITEM AGAIN, WHILE THE MENU STILL HOLDS THE CURSOR.
#
# The state `found-29-sep/space-create-menu-keeps-focus-after-create` was found
# in: the creator mounts while the menu is open, its title takes the cursor and
# the menu's focus trap takes it straight back, and the menu animates out
# holding it, then gives it to the space's "+" behind the modal. The creator is
# on screen, on the right tab, with the space chosen; the name typed into it
# goes to a button nobody can see, and its first space opens the menu again.
#
# Reddens: space-create-menu: "Task from the space’s “+” opens the creator with the cursor in its title: a name typed the moment it shows lands there whole"
import io
p = '/home/user/rundesk/apps/web/src/components/workspace-sidebar.tsx'
a = """                            onSelect={() => {
                              spaceCreateChosen.current = { spaceId: space.id, kind: type.value }
                            }}
"""
b = """                            onSelect={() => setSpaceCreate({ spaceId: space.id, kind: type.value })}
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-sidebar.tsx: the space "+" menu opens the creator while it still holds the cursor.')
