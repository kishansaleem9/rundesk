# "BLOCK PUBLIC SHARING" DOES NOT STOP PORTALS, as it did not.
# Reddens: hook-portal-access: "with public sharing blocked no new portal is made, by a member or the admin — and an existing one can still be switched off"
import io
p = '/home/user/rundesk/apps/api/src/modules/client-portal/client-portal.service.ts'
a = "    if (ws?.blockPublicSharing) throw new ForbiddenException('Public sharing is disabled for this workspace')\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("hpa-10-portals-ignore-the-switch: applied")
