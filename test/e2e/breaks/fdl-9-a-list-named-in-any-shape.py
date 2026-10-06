# A LIST IS TAKEN IN ANY SHAPE (`found-30-sep/field-definition-takes-a-foreign-list`, its review): a `listId` that is not a string reaches the rule and the
# store, and is refused, if at all, as a list that is not there (404) rather than as a malformed one (400).
# Reddens: field-writes-by-level: "a list is named by its id and nothing else: a member shared a list to view, in a space they may edit, sending it as [that list] is refused before any rule is asked, and so is the admin sending the project’s own list so (400 “listId must be a string or null”, none made, read by SQL)"
import io
p = '/home/user/rundesk/apps/api/src/modules/custom-fields/custom-fields.service.ts'
a = "    if (dto.listId != null && typeof dto.listId !== 'string') {\n      throw new BadRequestException('listId must be a string or null')\n    }\n"
b = '    // BROKEN: a listId of any shape is taken\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('fdl-9-a-list-named-in-any-shape: a list is taken in any shape')
