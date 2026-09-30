# ANOTHER WORKSPACE'S TEMPLATE IS READ, AND RETAGGED, BY ID (`ledger-rows/row-1874`).
# Reddens: unit: project-templates.service.test.ts "answers another workspace's template as one that is not there"
import io
p = '/home/user/rundesk/apps/api/src/modules/project-templates/project-templates.service.ts'
a = ("    if (row.workspaceId && row.workspaceId !== workspaceId) {\n"
     "      throw new NotFoundException('Template not found')\n"
     "    }\n")
b = "    // BROKEN: any workspace's template\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ptt-15-another-workspaces-template-unit: a template is found whatever its workspace')
