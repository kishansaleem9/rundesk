# A MALFORMED TEMPLATE ID IS HANDED TO POSTGRES (`ledger-rows/row-1874`).
# Postgres refuses it as uuid syntax, and every route that reads one answers 500.
# Reddens: unit: project-templates.service.test.ts "answers a malformed id as a template that is not there, without asking the database"
import io
p = '/home/user/rundesk/apps/api/src/modules/project-templates/project-templates.service.ts'
a = "    if (!isUuid(id)) throw new NotFoundException('Template not found')\n"
b = "    // BROKEN: any id goes to Postgres\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ptt-14-malformed-id-reaches-postgres-unit: a malformed id is queried')
