# Anything typed into the search box offers to invite it.
#
# `looksLikeEmail` goes, so searching for a colleague whose name you have
# half-remembered offers to email "Zzzz Nobody At All" — the suite's own words
# for it: "Offering to 'invite Zzzz Nobody' would be offering to email a
# person's name."
#
# And it is worse than a silly label. The button is live: pressing it posts an
# invitation with that string as the address, so the workspace gains a pending
# invite nobody can ever accept, addressed to something that is not an address.
# The manager check above it survives, so this is available to exactly the
# people whose invitations count.
#
# The regex is the kind of guard that reads as over-careful. "Any non-empty
# query that matched nobody could be an invitation" is a sentence that sounds
# more helpful, and it is the one this patch implements.
#
# ONE CHECK, AND IT IS THE LAST ONE — the only place in the suite that types
# something which is neither a member nor an email. The real invitation still
# works end to end, so the two checks above it stay green, which is what makes
# the miss-is-not-an-invitation check a check of its own.
#
# Reddens: assignee-picker: "a name that matches nobody is a miss, not an invitation"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = "  const canInvite = looksLikeEmail && !alreadyHere && isManagerOrAbove"
b = "  const canInvite = query.trim().length > 0 && !alreadyHere && isManagerOrAbove"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('task-detail-sheet.tsx: any text now offers to be invited as an email address.')
