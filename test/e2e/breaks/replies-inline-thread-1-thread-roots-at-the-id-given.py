# `getThread` roots the thread at the message it was asked about, instead of at
# that message's parent.
#
# This is the defect as found, preserved. The method's comment states it: a
# reply notification carries the id of the REPLY, "so asking for that id
# returned the reply as the 'parent' with an empty list of replies under it —
# a thread that reads as having nothing in it, which is the opposite of why you
# opened it."
#
# It is the reading anybody would write first. `GET /messages/:id/thread` looks
# like it should answer about `:id`, and every other reader of this endpoint —
# the channel's own thread panel — passes the parent's id, where the two
# answers are identical. Only the Replies page passes a reply, which is why
# this survived until §G12-2.
#
# REDDENS THREE, AND THEY ARE THREE DIFFERENT SURFACES SAYING THE SAME THING.
# The API check sees the wrong root; the panel's parent block shows the reply
# instead of the message being replied to; and the answer is posted under the
# reply rather than under the parent, so it never appears in the parent's
# thread. Nothing above them moves — the notification still arrives, and the
# page still never leaves /replies, which is the point: this is a defect about
# WHICH thread, not about whether there is one.
#
# Reddens: replies-inline-thread: "and the thread it opens is rooted at the parent, not at the reply"
import io
p = '/home/user/rundesk/apps/api/src/modules/chat/chat.service.ts'
a = """    const parent = named.parentMessageId
      ? await this.getMessageById(named.parentMessageId, userId)
      : named
"""
b = """    const parent = named
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('chat.service.ts: a thread is now rooted at whichever message you named.')
