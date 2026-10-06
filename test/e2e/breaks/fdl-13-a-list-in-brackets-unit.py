# A LIST’S ID IN BRACKETS READS AS THE ID (`found-30-sep/field-definition-takes-a-foreign-list`, its review): `isUuid` tests the text of what it is handed, so
# `listOfProject` asks the database for `["<id>"]`, and the rule takes the array as its list step, which no share matches.
# Reddens: unit: field-access.test.ts "answers no for a list’s id sent in an array, without asking — its text reads as the id"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/field-access.ts'
a = "  if (typeof listId !== 'string' || !isUuid(listId)) return false\n"
b = '  if (!isUuid(listId as string)) return false // BROKEN: any shape whose text reads as an id\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('fdl-13-a-list-in-brackets-unit: a list id in brackets reads as the id')
