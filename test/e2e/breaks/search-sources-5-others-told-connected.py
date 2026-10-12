# A WORKSPACE'S GMAIL IS CONNECTED FOR EVERYONE: one person's mailbox, searched for every member.
#
# Re-aimed 12 October: Connected Search is person by person (`found-23-sep/connected-search-per-person`):
# a mailbox connected in the App Center answers its connector alone, and a member is told theirs is not
# connected. This patch makes the workspace's Gmail everyone's again.
# Reddens: search-sources: "the admin’s Gmail is connected for the admin, and for a member it is not connected — theirs to connect for themselves"
#   or "a member choosing Gmail is told it is not connected and offered to connect their own — and no Connect for the workspace"
#
# Measured 12 October: the last of these is a knock-on of the same edit, measured on lane 8 — a check that stands on what the first one lost.
import io
p = '/home/user/rundesk/apps/api/src/modules/search/search.service.ts'
a = "          return shared.connectedById === userId\n            ? { id, provider, connected: true, heldBy: 'you' as const, canConnect: true }\n"
b = "          return shared.connectedById === userId || !!shared\n            ? { id, provider, connected: true, heldBy: 'you' as const, canConnect: true }\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("search-sources-5-others-told-connected: applied")
