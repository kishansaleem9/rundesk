# CREATED BY IS COUNTED OVER THE WHOLE WORKSPACE, WHATEVER THE SCOPE (`ledger-rows/row-1874`).
#
# Counted over the search alone, the menu standing inside Built-in lists the
# workspace's own makers beside the built-ins, which nobody in it made — every
# other facet there reads the scope.
#
# Reddens: template-center: "the built-ins, which nobody in the workspace made, are counted under nobody"
import io
p = '/home/user/rundesk/apps/api/src/modules/project-templates/project-templates.service.ts'
a = ("        .innerJoin(users, eq(users.id, projectTemplates.createdById))\n"
     "        .where(countBasis)\n")
b = ("        .innerJoin(users, eq(users.id, projectTemplates.createdById))\n"
     "        .where(scopeBasis) // BROKEN: the scope is not read\n")
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('template-center-16-makers-ignore-the-scope: Created by inside Built-in lists the workspace\'s makers')
