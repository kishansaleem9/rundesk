# AN EMOJI RULE THAT REFUSES EVERY UPLOAD.
# Reddens: object-key-boundaries: "while the workspace’s own upload becomes an emoji whose image serves its bytes"
import io
p = '/home/user/rundesk/apps/api/src/modules/chat/chat.service.ts'
a = "      if (!isKeyDirectlyUnder(key, `chat/${workspaceId}/emoji/`)) throw new BadRequestException('Invalid storageKey')\n"
b = "      if (true) throw new BadRequestException('Invalid storageKey')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("okb-6-emoji-refuses-own: applied")
