# A WORKSPACE LOGO IS SAVED AT ANY ADDRESS AGAIN.
# Reddens: settings-writes: "a logo at another host is refused and not saved — the workspace’s own upload is"
import io
p = '/home/user/rundesk/apps/api/src/modules/workspaces/workspaces.service.ts'
a = "      if (patch.logoUrl !== current?.logoUrl) {\n        throw new BadRequestException('A workspace logo must be an image uploaded here')\n      }\n"
b = '      void current\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("stw-2-a-logo-at-any-host: applied")
