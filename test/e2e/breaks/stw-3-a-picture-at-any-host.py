# A PROFILE PICTURE IS SAVED AT ANY ADDRESS AGAIN.
# Reddens: settings-writes: "a profile picture at another host is refused and not saved — an uploaded one is, and none removes it"
import io
p = '/home/user/rundesk/apps/api/src/modules/users/users.service.ts'
a = "      if (patch.avatarUrl !== current?.avatarUrl) {\n        throw new BadRequestException('A profile picture must be an image uploaded here')\n      }\n"
b = '      void current\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("stw-3-a-picture-at-any-host: applied")
