# A GUEST DEFINES FIELDS WHERE SHARED TO EDIT, WHICH CLICKUP REFUSES THEM.
# Reddens: field-writes-by-level: "a guest defines no field, even on a project shared with them to edit (403, none made), and sets no value on a task shared with them to view (403, none written)"
import io
p = '/home/user/rundesk/apps/api/src/modules/custom-fields/custom-fields.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "    if (row.role === 'guest') throw new ForbiddenException('Guests cannot define custom fields')\n"
b = ''
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('fwl-6-guests-define-fields: a guest defines fields where shared to edit, which clickup refuses them')
