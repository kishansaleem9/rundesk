# The palette goes back to being mounted all the time rather than only while open. It
# registers a window-level Cmd-K listener of its own, so a second always-mounted copy makes
# one keypress toggle two palettes - and the bar stops being a launcher at all.
# Reddens: planner-command-bar: "nothing is mounted before the bar is pressed"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-planner-page.tsx'
a = '        {paletteOpen && ('
b = '        {true && ('
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-planner-page.tsx: a second palette is mounted before the bar is ever pressed.')
