# A PERSON REMOVED FROM A WORKSPACE IS ASKED ABOUT ITS ROOMS ONE BY ONE (`found-6-oct/an-open-socket-outlives-its-access`).
#
# One membership read for each person and workspace settles all of a removed
# person's rooms there, first thing in the pass. Settle nothing that way and
# each room waits for its turn: a removed member holding thousands of rooms
# goes on hearing them for passes.
#
# Reddens: unit: realtime.gateway.test.ts "a person no longer a member of a workspace leaves every room of theirs there at once, on one membership read however many they hold; a member, and a super_admin, are asked room by room"
import io
p = '/home/user/rundesk/apps/api/src/modules/realtime/realtime.gateway.ts'
a = '        if (member) continue\n'
b = '        if (member || pair.questions.length > 0) continue\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('rae-28-a-removed-member-asked-room-by-room-unit: a removed member is asked about their rooms one by one')
