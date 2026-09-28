# The call card is written to the database and reaches an open channel by no
# route at all.
#
# TWO EDITS, IN TWO FILES, AND THAT IS THE FINDING RATHER THAN A LICENCE.
#
# The first version of this patch removed only the `chat.message.created` emit
# in `announce()`. It ran GREEN twice — once against a pair of checks that both
# tolerated a reload, and again after a third check was added asserting the card
# arrives WITHOUT one. The second green is the interesting one: the card really
# did arrive, pushed, with the emit gone.
#
# Because delivery has a SECOND, INDEPENDENT PATH. `call.started` carries the
# channel id, and `workspace-chat-page.tsx` invalidates `chat-messages` for that
# channel on any `call.*` event that has one — so an open channel refetches, the
# row is already in the database, and the card appears. Neither emitter can be
# removed on its own: whichever goes, the other covers for it.
#
# So a single plausible mistake cannot break "and the other person sees it in
# the channel", and this patch stops pretending to be one. It removes both
# paths, which is the MINIMUM edit that can disprove the claim — and it is
# recorded here as such, because a patch that reddens nothing is not evidence
# and a patch spread over two files is not a mistake anybody would make.
#
# What the redundancy costs is worth the note too: the invalidation fires on
# every join, leave and recording toggle, so the card's delivery is guaranteed
# by a mechanism that exists for something else. That is why neither line looks
# load-bearing on its own, and it is exactly the shape that made the first
# version of this patch read as a real defect.
#
# PREDICTED TWO AND IT IS ONE, and the one that stayed green is the reason the
# suite is built the way it is. Of the three checks on this claim, TWO tolerate
# a reload by design:
#
#   - "the call posts a card into the channel" reads the SERVER, and the row is
#     there — this patch keeps the insert.
#   - "and the other person sees it in the channel" RELOADS before giving up, on
#     purpose, so that never-announced and never-written are told apart instead
#     of arriving as one silent timeout. With the row in the database the reload
#     finds it, and the check passes.
#
# So only "and it arrives without a reload" can fall, which is exactly the check
# added after the first version of this patch ran green twice. The prediction of
# two was reading the sentences rather than the code under them: the middle
# check's own comment says it reloads, and a check that reloads cannot see a
# missing push.
#
# RE-AIMED 24 September: the readers are `{ workspace, users }` now — the workspace's
# room, and each guest a public channel reaches told in their own
# (`found-24-sep/guests-read-every-open-channel`); the mistake is the same.
# Reddens: syncup-live: "and it arrives without a reload — a card you have to refresh for is a log entry"
import io

# Re-anchored when the card stopped going to the whole workspace and went to
# its channel's readers (`found-24-sep/chat-events-broadcast-to-the-workspace`):
# the emit is now two lines choosing the room, and removing both is the same
# edit as removing the one call it was.
p = '/home/user/rundesk/apps/api/src/modules/calls/calls.service.ts'
a = """    if (readers.workspace) this.realtime.emitToWorkspace(workspaceId, event)
    for (const userId of readers.users) this.realtime.emitToUser(userId, event)
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, '    void readers\n    void event\n'))

# …and the second path, which is what made the first version of this inert.
q = '/home/user/rundesk/apps/web/src/pages/workspace-chat-page.tsx'
b = """        if (event.channelId) {
          qc.invalidateQueries({ queryKey: ['chat-messages', event.channelId] })
        }
"""
t = io.open(q, encoding='utf-8').read()
assert t.count(b) == 1, f'anchor appears {t.count(b)} times in {q}, expected exactly 1'
io.open(q, 'w', encoding='utf-8').write(t.replace(b, '        void event.channelId\n'))
print('calls.service.ts + workspace-chat-page.tsx: the card reaches an open channel by no route.')
