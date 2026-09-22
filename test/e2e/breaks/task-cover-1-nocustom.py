# Check 15 — the Gallery goes back to being colours and nothing else.
#
# Frame `03:07`'s Gallery is "Colors" plus a bordered ninth cell reading
# Custom. Take the cell away and the tab still looks complete — a grid of
# swatches, all of which work — which is exactly why its absence went
# unnoticed until somebody wanted a colour that was not one of the twelve.
#
# TWO EARLIER VERSIONS OF THIS PATCH WERE INERT, both for the same reason —
# something later in the element won:
#
#   1. `hidden` as an attribute. The button carries Tailwind's `flex`, and an
#      explicit `display` beats the `hidden` attribute's UA `display: none`.
#   2. An inline `style={{ display: 'none' }}` inserted after the testid. The
#      button ALREADY has a `style` prop, three lines further down, and
#      duplicate JSX props compile to one object literal in source order — the
#      LAST one wins, so the conditional style overwrote the hiding one and the
#      cell stayed on screen.
#
# So this replaces the element's own `style` prop rather than adding a second.
#
# Reddens: task-cover: "the Gallery offers Custom beside the fixed swatches"
import io, sys
p = '/home/user/rundesk/apps/web/src/components/cover-image-picker.tsx'
s = io.open(p, encoding='utf-8').read()
a = "                  style={customOpen ? { borderColor: customColor, color: customColor } : undefined}\n"
if s.count(a) != 1:
    sys.exit('anchor %d times' % s.count(a))
io.open(p, 'w', encoding='utf-8').write(
    # BROKEN: the Custom cell is not on screen
    s.replace(a, "                  style={{ display: 'none' }}\n")
)
print('BROKE check 15: the Gallery no longer offers Custom')
