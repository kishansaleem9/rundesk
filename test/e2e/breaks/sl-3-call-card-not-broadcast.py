# The call card is written to the database and never broadcast.
#
# ITS MIRROR, and the row really is there — which is what makes it survive every
# server-side check. `announce()` still inserts the `chatMessages` row with its
# `callId` and its plain-words body, the notifications still go out to the
# channel's members, and a reload shows the card because the messages query
# fetches it. Only the realtime emit goes, which reads like removing a duplicate
# of work the query already does.
#
# What it costs is the moment the card is FOR. Somebody starts a SyncUp and the
# people already looking at the channel see nothing until they happen to
# reload — which is exactly when a call invitation is worthless. A card that
# arrives after the call is over is a log entry.
#
# ONE CHECK, AND THE SUITE SPLITS THE CLAIM IN TWO SO IT CAN SAY WHICH HALF
# BROKE. "the call posts a card into the channel" reads the server and still
# passes; "and the other person sees it in the channel" watches B's screen and
# then reloads before giving up, so it fails only when the card reaches nobody
# either way. Written was never the same fact as delivered, and this patch is
# the case that separates them.
#
# Reddens: syncup-live: "and the other person sees it in the channel"
import io
p = '/home/user/rundesk/apps/api/src/modules/calls/calls.service.ts'
a = """    this.realtime.emitToWorkspace(workspaceId, {
      type: 'chat.message.created',
      workspaceId,
      channelId,
      message: { ...message, authorName: who, reactions: [] },
    } as never)

"""
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('calls.service.ts: the call card is stored but never pushed to anybody.')
