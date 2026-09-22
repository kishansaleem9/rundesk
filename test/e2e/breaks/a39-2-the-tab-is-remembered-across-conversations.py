# The tab is not reset when you change conversation, so a DM reopens on
# whichever tab you left another one on.
#
# `useEffect(() => { setDmTab('chat') }, [selectedId])` goes. Leave a DM on
# Tasks, open a channel, come back — and the DM opens on Tasks, with the stream
# hidden. Worse across two DMs: open Ana on Calendar, switch to Ben, and Ben's
# conversation opens on Calendar showing the meetings you share with BEN, which
# looks like a working feature and is not the one you asked for.
#
# The stream being hidden is what makes this more than an annoyance. A DM that
# opens on Tasks looks like a DM with no messages in it, and the composer is
# out of the way too — so the ordinary act of opening a conversation to say
# something lands on a screen with nowhere to type.
#
# A one-line effect whose whole body is a reset is exactly the kind of line
# that reads as redundant beside a `useState` initialiser that already says
# `'chat'`.
#
# ONE CHECK, THE LAST: "coming back to the DM lands on Chat, not on stale
# Tasks". The check before it — that the strip disappears on a channel — passes,
# because the strip's own guard is untouched; and every tab switch inside the
# one DM still works.
#
# Reddens: a39-dm-tabs: "coming back to the DM lands on Chat, not on stale Tasks"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-chat-page.tsx'
a = "  useEffect(() => { setDmTab('chat') }, [selectedId])\n"
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-chat-page.tsx: the DM tab survives a change of conversation.')
