# A PROJECT SAVED AS A TEMPLATE RECORDS NOBODY AS ITS MAKER (`ledger-rows/row-1874`).
#
# The row's mirror: `created_by_id` was written and read by nothing, and here
# it is read and not written — the template is in the grid and under no one in
# Created by.
#
# Reddens: template-center: "and Created by counts it under the admin who saved it — 8 now"
import io
p = '/home/user/rundesk/apps/api/src/modules/project-templates/project-templates.service.ts'
a = "        createdById: actor.id,\n"
b = "        createdById: null, // BROKEN: no maker recorded\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('template-center-25-save-records-no-maker: a saved template has no maker')
