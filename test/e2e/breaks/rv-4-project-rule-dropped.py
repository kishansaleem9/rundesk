# A CONTAINER FILTER THAT FORGETS PRIVATE PROJECTS.
# Reddens: read-visibility: "nor one in a private project they are not in"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/container-access.guard-helper.ts'
a = "    or(\n      isNull(projects.visibility),\n      ne(projects.visibility, 'private'),\n      inArray(projects.id, memberProjects),\n      inArray(projects.spaceId, adminSpaces),\n    ),\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("rv-4-project-rule-dropped: applied")
