# The Chat / Calendar / Tasks strip renders on channels as well as DMs.
#
# The comment above it says why it does not: "a DM is the one place 'what are we
# both on?' is the real question, so it gets Chat / Calendar / Tasks rather than
# only a stream. Channels keep the stream alone; the question does not apply."
#
# On a channel the question has no answer. The panel behind those tabs is built
# from `dmPeerId` — one other person — and a channel has none, so Calendar and
# Tasks render against nothing: two tabs that hide the stream and show an empty
# list. The strip is offered on every conversation in the product and works on
# some of them.
#
# `selectedChannel?.isDm && selectedChannel.dmPeerId` is a two-clause guard
# where the second clause is what the panel actually needs, so dropping the
# first reads as removing a redundant test.
#
# REDDENS TWO, AND BOTH ARE ABOUT CHANNELS: the strip appears on the channel the
# suite lands on, and it survives the later switch back to one. Every DM check
# in between is untouched — which is the point, because the defect is not that
# the strip is broken but that it is somewhere it cannot mean anything.
#
# Reddens: a39-dm-tabs: "no Chat/Calendar/Tasks strip on a channel"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-chat-page.tsx'
a = "        {selectedChannel?.isDm && selectedChannel.dmPeerId && (\n          <div className=\"flex items-center gap-1 border-b border-border px-4 py-1.5\">"
b = "        {selectedChannel && (\n          <div className=\"flex items-center gap-1 border-b border-border px-4 py-1.5\">"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-chat-page.tsx: the DM tab strip now renders on channels too.')
