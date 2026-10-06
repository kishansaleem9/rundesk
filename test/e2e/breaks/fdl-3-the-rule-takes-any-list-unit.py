# THE DEFINE RULE TAKES THE LIST AS IT WAS SENT, as `fdl-1`, for the unit tests of `assertMayDefineFields`
# (`found-30-sep/field-definition-takes-a-foreign-list`).
# Measured 5 October, after the review's change: 3 of the file's 7 tests fail — the one named; “asks whether the list is one of this
# project’s with the list and the project, each in its own column”, since the rule asks nothing of the kind; and the private list's,
# because the stand-in database then answers the read rule's query with the row it had for `listOfProject`, which names no visibility.
# Reddens: unit: field-access.test.ts "a share on a list of another project does not let a member define a field in a view-only space: the space’s answer stands (403)"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/field-access.ts'
a = "  const ownList = listId != null && (await listOfProject(db, projectId, listId)) ? listId : null\n"
b = "  const ownList = listId ?? null // BROKEN: any list, as it was sent\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("fdl-3-the-rule-takes-any-list-unit: the define rule takes a list of another project as a step on the way")
