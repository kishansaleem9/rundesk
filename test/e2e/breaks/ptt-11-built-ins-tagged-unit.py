# A WORKSPACE TAGS A BUILT-IN, asked of the service itself (`ledger-rows/row-1874`).
# Reddens: unit: project-templates.service.test.ts "refuses a built-in, which every workspace is shown, and writes nothing"
import io
p = '/home/user/rundesk/apps/api/src/modules/project-templates/project-templates.service.ts'
a = "    if (tpl.isBuiltIn || !tpl.workspaceId) throw new BadRequestException('A built-in template cannot be tagged')\n"
b = "    // BROKEN: a built-in may be tagged\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ptt-11-built-ins-tagged-unit: a built-in takes a workspace\'s tags')
