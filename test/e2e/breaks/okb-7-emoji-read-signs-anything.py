# THE EMOJI READ AS IT WAS: any stored key signed.
# Reddens: object-key-boundaries: "and an emoji whose key names another workspace’s object draws nothing — while the workspace’s own still draws"
import io
p = '/home/user/rundesk/apps/api/src/modules/chat/chat.service.ts'
a = '    if (!isKeyDirectlyUnder(key, `chat/${workspaceId}/emoji/`)) return null\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("okb-7-emoji-read-signs-anything: applied")
