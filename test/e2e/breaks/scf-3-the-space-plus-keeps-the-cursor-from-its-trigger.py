# THE SPACE'S "+" MENU OPENS THE CREATOR WITHOUT LETTING THE CURSOR SETTLE ON THE "+".
#
# `preventDefault` in the menu's `onCloseAutoFocus` stops Radix putting the
# cursor back on its trigger, so when the creator opens nothing has it but
# `<body>`, and that is what the creator — which gives the cursor back to what
# had it when it opened (`found-29-sep/create-modal-returns-focus-to-nothing`)
# — returns it to. The title still takes the cursor and the name still lands;
# only the way back is lost.
#
# Reddens: space-create-menu: "and the cursor goes back to the space’s “+” the creator was opened from, not to the page"
import io
p = '/home/user/rundesk/apps/web/src/components/workspace-sidebar.tsx'
a = """                      onCloseAutoFocus={() => {
                        // The menu has gone; the "+" has the cursor. Now the creator.
                        const chosen = spaceCreateChosen.current
                        if (!chosen) return
"""
b = """                      onCloseAutoFocus={(e) => {
                        const chosen = spaceCreateChosen.current
                        if (!chosen) return
                        e.preventDefault()
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-sidebar.tsx: the space "+" keeps the cursor from its trigger, so the creator has nothing to give it back to.')
