# THE DEFINE RULE ASKS NOTHING OF A PRIVATE LIST, as `fdl-8`, for the unit tests of `assertMayDefineFields`
# (`found-30-sep/field-definition-takes-a-foreign-list`, its review).
# Reddens: unit: field-access.test.ts "refuses a field scoped to a private list of this project to a member who may not open it, in its own words (403 “This list is private”)"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/field-access.ts'
a = "  if (ownList && !(await readableList(db, workspaceId, ownList, reader))) {\n    throw new ForbiddenException('This list is private')\n  }\n"
b = '  // BROKEN: a private list is not asked\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('fdl-12-a-private-list-asks-nothing-unit: the define rule asks nothing of a private list')
