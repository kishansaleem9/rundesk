# A PLACEMENT RULE THAT REFUSES EVERYTHING: nothing can be moved or applied anywhere.
# Reddens: space-default-permission: "while moving it into another project they may edit still works"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/container-access.ts'
a = '  if (!params.actorId) return\n  const [space] = await db\n'
b = "  if (!params.actorId) return\n  throw new ForbiddenException('No')\n  const [space] = await db\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("sdp-22-placement-refuses-all: applied")
