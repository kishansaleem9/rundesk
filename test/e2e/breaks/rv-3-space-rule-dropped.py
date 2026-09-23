# A CONTAINER FILTER THAT FORGETS PRIVATE SPACES.
# Reddens: read-visibility: "but not a task in a private space the member is not in"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/container-access.guard-helper.ts'
a = "    or(ne(spaces.visibility, 'private'), inArray(spaces.id, memberSpaces)),\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("rv-3-space-rule-dropped: applied")
