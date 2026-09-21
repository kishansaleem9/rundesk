# Escape on the ⋯ menu stops being spent on the menu, so Radix closes the whole
# palette underneath it — the behaviour the fix replaces, and the reason the
# check asserts the palette is STILL OPEN rather than only that the menu went.
#
# The menu still closes. A check reading "the menu is gone" alone would pass.
#
# REWRITTEN 21 September: the first version anchored on a `document` keydown
# listener with `stopPropagation`, which is what the fix replaced — Radix
# registers its own listener when the dialog MOUNTS, so a later one can never
# win. `wt-break.sh` reported PATCH FAILED rather than counting it, which is
# the harness behaving correctly. This anchors on the seam that does work.
#
# Reddens: command-palette:
#   "Escape closes the ⋯ menu and leaves the palette, and the query, alone"
import io
p = '/home/user/rundesk/apps/web/src/components/command-palette.tsx'
a = """      onEscapeKeyDown={(e) => {
        if (!typeMenuOpen) return
        e.preventDefault()
        setTypeMenuOpen(false)
      }}"""
b = """      onEscapeKeyDown={() => {
        setTypeMenuOpen(false)
      }}"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('command-palette.tsx: Escape closes the menu and the palette with it again.')
