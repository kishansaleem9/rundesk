# The docs tree collapses its CONTENTS and keeps its column width.
#
# The rail renders, the expand button is there, the tree's pages are gone — from
# a screenshot at a glance this is a collapsed panel. The grid template is the
# one thing that did not change, so the 240px column stays 240px with an icon
# in the middle of it, and the editor gains nothing at all.
#
# The plausible route is a merge that took the markup change and not the layout
# change: `treeCollapsed` already switches four grid templates, three of which
# are for the comments and history panels, and dropping the tree's own branch
# from that ternary looks like removing a duplicate.
#
# THE MEASUREMENT IS THE CHECK, and it is the only reason this is visible. The
# suite reads bounding boxes because the claim is about SPACE — "yeh SPACE leta
# hai" — and every markup-shaped assertion about this build passes: the rail is
# present, `data-collapsed` is "true", the tree's own testid is gone, the
# server records the preference. A suite that asserted the rail exists would
# call this a collapsed panel.
#
# One check, and one is the honest count: it is the only one in the suite that
# reads the collapsed strip's width.
#
# Reddens: panel-collapse: "collapsing leaves a 48px strip"
import io
p = '/home/user/rundesk/apps/web/src/components/docs-panel.tsx'
a = """          ? commentsOpen && historyOpen
            ? 'md:grid-cols-[48px_1fr_300px_300px]'
            : commentsOpen || historyOpen
              ? 'md:grid-cols-[48px_1fr_300px]'
              : 'md:grid-cols-[48px_1fr]'
"""
b = """          ? commentsOpen && historyOpen
            ? 'md:grid-cols-[240px_1fr_300px_300px]'
            : commentsOpen || historyOpen
              ? 'md:grid-cols-[240px_1fr_300px]'
              : 'md:grid-cols-[240px_1fr]'
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('docs-panel.tsx: the collapsed tree keeps its 240px column.')
