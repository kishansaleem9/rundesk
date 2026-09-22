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
# PREDICTED ONE AND IT RAN GREEN, WHICH FOUND THE SUITE MISSING A THIRD FACT.
#
# The suite split the claim in two so it could say which half broke: "the call
# posts a card into the channel" reads the server, and "and the other person
# sees it in the channel" watches B's screen and then RELOADS before giving up.
# The reload is deliberate — it separates "never announced" from "never
# written" — and it is also why neither check can tell a card that was PUSHED
# from one that was merely stored and found on the next fetch. This patch stores
# it and pushes nothing, and both checks passed.
#
# The suite computed `neededReload` and read it nowhere, which is the facade's
# mirror inside a test suite: a value derived correctly, by a variable named
# after exactly the fact nobody asserted. It is a check of its own now — "and it
# arrives without a reload — a card you have to refresh for is a log entry" —
# and `EXPECTED_CHECKS` went 58 → 59.
#
# Reddens: syncup-live: "and it arrives without a reload"
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
