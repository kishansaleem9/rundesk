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
# PREDICTED THREE AND IT REDDENED FIVE, AND TOOK THE RUN DOWN WITH IT. The
# three predicted were the rail existing, its width and its contents. The two
# extra are honest: `reclaiming 216px of chrome, which is the whole complaint`
# subtracts one box from the other and gets `272 -> undefined`, and the fresh
# second browser finds no rail either, because the element is not rendered for
# anybody.
#
# Then `getByTestId('chat-panel-expand').click()` spent thirty seconds retrying
# a button that lives INSIDE the rail this patch hid, threw, and the run ended
# on `3 passed, 5 failed` with `✗ only 8 of 56 checks ran`. Forty-eight checks
# did not run, and the harness's own record of that — a patch line with five
# FAIL lines under it — is what a patch reddening five checks looks like. The
# suite's four collapse/expand clicks are bounded at eight seconds now and the
# checks that needed them fail with the reason, so this reports its five and
# the run reaches its own totals.
#
# Reddens: panel-collapse: "collapsing leaves a rail" and
#   "at 56px, not zero — channels stay one click away" and
#   "and the rail still carries the channels" and
#   "reclaiming 216px of chrome, which is the whole complaint" and
#   "the preference is the person’s, not the machine’s"
import io
p = '/home/user/rundesk/apps/web/src/components/chat/chat-sidebar.tsx'
a = '        className="hidden md:flex w-[56px] shrink-0 flex-col items-center border-r border-border/80 bg-[#fbfbfc] py-2 dark:bg-[#16181d]"\n'
b = '        className="hidden w-0 shrink-0 flex-col items-center overflow-hidden border-r border-border/80 bg-[#fbfbfc] py-2 dark:bg-[#16181d]"\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('chat-sidebar.tsx: collapsing the channel list leaves nothing behind.')
