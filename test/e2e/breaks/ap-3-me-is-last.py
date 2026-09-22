# The "Me first" comparator runs backwards, so you are sorted to the BOTTOM of
# the picker.
#
# Frame `15:45` puts **Me** at the top of the People section, and the code's own
# comment says why: "Yourself first, which is who most assignments are for."
# Reversed, the most common assignment in the product is the one furthest from
# the cursor — and in a workspace past the twenty-row cap it is off the list
# entirely, so assigning yourself means searching for your own name.
#
# A REVERSAL RATHER THAN A DELETION, for the reason `trending-sort-4` records:
# removing the sort would leave `Array.prototype.sort` stable and the incoming
# order intact, and whether that order happens to start with the admin is a
# property of the server's ORDER BY rather than of this comparator. A patch
# whose outcome depends on a fixture's alphabet is a patch that runs green on
# somebody else's roster. Reversed, it fails wherever more than one person
# exists.
#
# ONE CHECK. The list is the same length, the search still narrows, the pick
# still assigns — only the first row is somebody else.
#
# Reddens: assignee-picker: "the first person offered is you"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = """    return scored.sort((a, b) =>
      a.userId === currentUserId ? -1 : b.userId === currentUserId ? 1 : 0,
    )
"""
b = """    return scored.sort((a, b) =>
      a.userId === currentUserId ? 1 : b.userId === currentUserId ? -1 : 0,
    )
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('task-detail-sheet.tsx: you are now sorted to the bottom of the assignee picker.')
