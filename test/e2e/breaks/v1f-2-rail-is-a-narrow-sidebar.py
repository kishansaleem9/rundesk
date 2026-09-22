# The collapsed rail grows to 96px so the labels stop truncating.
#
# The kinder-looking fix for a real complaint: at 72px a nine-pixel label like
# "Dashboard" or "Whiteboards" truncates, and the obvious answer is a slightly
# wider rail. It stays an icon rail — icons centred, labels under them, tooltip
# on hover — and it still collapses, still expands, still persists to the
# account. Nothing is broken; it is just bigger.
#
# `[10:24]` is about exactly the thing that got bigger: "mujhe nahi chahiye to
# space le". The whole feature is the width, and a rail that creeps is a rail
# that stops paying for itself — 24px is a third more chrome for a label that
# the tooltip already covers.
#
# TWO CHECKS, AND THE SUITE MEASURES RATHER THAN ASSERTS BECAUSE OF THIS. Its
# comment says so: "Labelled, but still a rail: the whole point was the space
# the wide sidebar took. If this ever creeps past ~90px it has stopped being
# the thing she asked for." Both the collapse check and the still-narrow check
# compare against 90, and both fall; `starts expanded` and `the destinations
# are still reachable` pass, because this is not a broken sidebar.
#
# `the page takes the space back` is the one to watch — it asserts the main
# column is over 1300px, and 24px off a 1608px viewport leaves it well clear,
# so it passes. The check that could see the cost most directly is the one
# least able to.
#
# Reddens: video1-fast-items: "collapses to a rail" and "and it is still narrow"
import io
p = '/home/user/rundesk/apps/web/src/components/workspace-sidebar.tsx'
a = """        collapsed && !drawer ? 'w-[72px]' : 'w-72',
"""
b = """        collapsed && !drawer ? 'w-[96px]' : 'w-72',
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)

# The dock-overlap arithmetic reads the same width; left in step so this is a
# width change and not also a layout bug.
w = "  const sidebarWidth = collapsed ? 72 : 288\n"
assert s.count(w) == 1, f'width anchor appears {s.count(w)} times in {p}, expected exactly 1'
s = s.replace(w, "  const sidebarWidth = collapsed ? 96 : 288\n")
io.open(p, 'w', encoding='utf-8').write(s)
print('workspace-sidebar.tsx: the collapsed rail is 96px, so the labels fit.')
