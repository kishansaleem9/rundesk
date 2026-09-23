# THE PLACEMENT RULE WITHOUT ITS VISIBILITY HALF: a private project accepts lists
# from people it keeps out.
# Reddens: space-default-permission: "nor into a private project they are not in, even in a space they may edit"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/container-access.ts'
a = '  if (!reachable) throw new ForbiddenException(`You do not have access to where this ${params.kind} would go`)\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("sdp-21-placement-ignores-visibility: applied")
