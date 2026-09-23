# THE CLIP RULE AS IT WAS: a prefix, which `..` walks out of — share signs another workspace's file.
# Reddens: object-key-boundaries: "a clip key that starts with the workspace’s clips and walks out of them is not shared — no link comes back for it"
import io
p = '/home/user/rundesk/apps/api/src/modules/clips/clip-keys.ts'
a = '  return isKeyDirectlyUnder(key, clipPrefix(workspaceId))\n'
b = "  return typeof key === 'string' && key.startsWith(clipPrefix(workspaceId))\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("okb-17-clip-rule-prefix-check: applied")
