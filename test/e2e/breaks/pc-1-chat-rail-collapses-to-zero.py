# The collapsed channel list goes to nothing instead of leaving a 56px rail.
#
# This is the version of the feature somebody asks for out loud. "Collapse"
# means gone, the frame's complaint was about space, and a 56px column is still
# a column — so hiding it entirely gives back more of what was asked for. The
# expand control moves to the workspace sidebar's own button, which still works,
# so there is no dead end.
#
# `[10:13]` is more specific than that: "yeh DOUBLE NAVIGATION rakhi hui hai…
# kyunke yeh SPACE leta hai". The problem is TWO full-width navigation columns,
# and the answer she is describing keeps the channels one click away rather than
# one navigation away. 56px of avatars is the difference between collapsing a
# panel and closing it.
#
# Three checks, and they divide the claim: the rail exists, it is 56px and not
# zero, and it still carries the channels. A build that left an empty 56px
# column would fail only the third; this fails all three, because the element is
# not rendered at all.
#
# Reddens: panel-collapse: "collapsing leaves a rail" and
#   "at 56px, not zero — channels stay one click away" and
#   "and the rail still carries the channels"
import io
p = '/home/user/rundesk/apps/web/src/components/chat/chat-sidebar.tsx'
a = '        className="hidden md:flex w-[56px] shrink-0 flex-col items-center border-r border-border/80 bg-[#fbfbfc] py-2 dark:bg-[#16181d]"\n'
b = '        className="hidden w-0 shrink-0 flex-col items-center overflow-hidden border-r border-border/80 bg-[#fbfbfc] py-2 dark:bg-[#16181d]"\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('chat-sidebar.tsx: collapsing the channel list leaves nothing behind.')
