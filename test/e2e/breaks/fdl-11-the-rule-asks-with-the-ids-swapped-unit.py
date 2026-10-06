# THE DEFINE RULE ASKS WITH THE TWO IDS THE WRONG WAY ROUND, as `fdl-10`, for the unit tests of `assertMayDefineFields`
# (`found-30-sep/field-definition-takes-a-foreign-list`, its review).
# Reddens: unit: field-access.test.ts "asks whether the list is one of this project’s with the list and the project, each in its own column"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/field-access.ts'
a = '  const ownList = listId != null && (await listOfProject(db, projectId, listId)) ? listId : null\n'
b = '  const ownList = listId != null && (await listOfProject(db, listId, projectId)) ? listId : null // BROKEN: the ids the wrong way round\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('fdl-11-the-rule-asks-with-the-ids-swapped-unit: the define rule asks for the list with the ids the wrong way round')
