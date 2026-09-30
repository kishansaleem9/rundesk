# THE SERVER IGNORES `createdBy=` (`ledger-rows/row-1874`).
#
# The page sends the maker's id and the browse answers with every template in
# the corpus, so the menu narrows nothing — however it is asked.
#
# Reddens: template-center: "and the server, asked the same, answers with those three and nobody else's"
import io
p = '/home/user/rundesk/apps/api/src/modules/project-templates/project-templates.service.ts'
a = "      selected.push(isUuid(createdBy) ? eq(projectTemplates.createdById, createdBy) : sql`false`)\n"
b = "      // BROKEN: createdBy is not applied\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('template-center-15-created-by-ignored: browse answers every maker\'s templates to createdBy=')
