# THE PICTURE A SIGN-IN PROVIDER SAVED IS REFUSED WHEN A SAVE SENDS IT BACK: only an upload's address passes.
# Reddens: settings-writes: "a save that sends back the picture a sign-in provider saved keeps it — and an address that walks out of the avatars is refused"
import io
p = '/home/user/rundesk/apps/api/src/modules/users/users.service.ts'
a = "      if (patch.avatarUrl !== current?.avatarUrl) {\n        throw new BadRequestException('A profile picture must be an image uploaded here')\n      }\n"
b = "      void current\n      throw new BadRequestException('A profile picture must be an image uploaded here')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("stw-4-the-providers-picture-refused: applied")
