# The inline composer drops `parentMessageId`, so the answer is posted to the
# channel as a new top-level message rather than into the thread.
#
# It reads correctly on screen for a moment — the mutation succeeds, the draft
# clears, the panel refetches — and the person's answer is now a message in
# the channel with no connection to the question. Whoever asked gets no reply
# notification, because their message was not replied to; they get a channel
# message, in a channel they may have muted.
#
# The line below it in the same mutation posts a bodied message with no parent
# on purpose — that is what "Also send to #channel" means — so the two calls
# differ by exactly this field, and the patch makes the first one the second.
#
# ONE CHECK. The thread still opens rooted at the parent, the parent block
# still renders, and the page still never leaves /replies. What fails is the
# one assertion that reads the PARENT's thread back from the server and looks
# for the answer in it — which is why that check reads the thread rather than
# the screen.
#
# Reddens: replies-inline-thread: "the reply reaches the thread"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-replies-page.tsx'
a = """      await api(`/chat/channels/${parent.channelId}/messages`, {
        method: 'POST',
        body: { body, parentMessageId: parent.id },
      })
"""
b = """      await api(`/chat/channels/${parent.channelId}/messages`, {
        method: 'POST',
        body: { body },
      })
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-replies-page.tsx: the inline answer is posted to the channel, not to the thread.')
