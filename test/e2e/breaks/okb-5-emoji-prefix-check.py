# THE EMOJI CHECK AS IT WAS: a prefix, which `..` walks out of.
# Reddens: object-key-boundaries: "an emoji key that starts with the workspace’s prefix and walks out of it is refused — the prefix check let it in"
import io
p = '/home/user/rundesk/apps/api/src/modules/chat/chat.service.ts'
a = "      if (!isKeyDirectlyUnder(key, `chat/${workspaceId}/emoji/`)) throw new BadRequestException('Invalid storageKey')\n"
b = "      if (!key.startsWith(`chat/${workspaceId}/emoji/`)) throw new BadRequestException('Invalid storageKey')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("okb-5-emoji-prefix-check: applied")
