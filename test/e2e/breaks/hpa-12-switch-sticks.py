# A PORTAL IS REFUSED WHETHER OR NOT SHARING IS BLOCKED.
# Reddens: hook-portal-access: "and once sharing is allowed again, the member makes one"
import io
p = '/home/user/rundesk/apps/api/src/modules/client-portal/client-portal.service.ts'
a = "    if (ws?.blockPublicSharing) throw new ForbiddenException('Public sharing is disabled for this workspace')\n"
b = "    if (ws) throw new ForbiddenException('Public sharing is disabled for this workspace')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("hpa-12-switch-sticks: applied")
