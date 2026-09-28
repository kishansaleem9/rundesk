# The palette is mounted whether or not the bar was pressed. It registers its own
# window-level ⌘K listener, so a second always-mounted copy makes one keypress
# toggle two palettes.
# Reddens: planner-command-bar: "nothing is mounted before the bar is pressed, and ⌘K opens exactly one palette"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-planner-page.tsx'
a = '        {paletteOpen && (\n          <Suspense fallback={null}>\n'
b = '        {true && (\n          <Suspense fallback={null}>\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-planner-page.tsx: the palette is mounted before anybody asks.')
