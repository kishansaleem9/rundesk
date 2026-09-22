# The collapsed rail drops its labels and keeps the hover tooltip.
#
# THE TRANSCRIPT READ TOO LITERALLY, which is exactly how this shipped the first
# time. "mujhe bas ICONS show hon" sounds like a column of unlabelled
# pictograms, and the label is a 9px span that a designer would happily delete
# as clutter — the tooltip is still there, so nothing is unreachable, and the
# rail gets visibly cleaner.
#
# The comment above the span is the specification and it survives the patch:
# what she was pointing at when she said it — "yeh NAVIGATION hai IN KI" — is
# ClickUp's own app bar, and that labels every icon. A rail you have to hover to
# read is not the thing she asked for; it is what "sirf icons" sounds like out
# of context.
#
# One check, and its failure message is written for exactly this: `and each icon
# says what it is`, with `(the rail is unlabelled)` for the empty case. The
# other three checks in the section — the rail exists, it is under 90px, the
# destinations are reachable — all still pass, because the links and the width
# are untouched. Removing the labels makes the rail MORE of what a careless
# reading asked for.
#
# Reddens: video1-fast-items: "and each icon says what it is"
import io
p = '/home/user/rundesk/apps/web/src/components/workspace-sidebar.tsx'
a = """                          <span className="w-full truncate text-center text-[9px] leading-tight">
                            {navLabel(entry.label)}
                          </span>
"""
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-sidebar.tsx: the collapsed rail is icons with no words.')
