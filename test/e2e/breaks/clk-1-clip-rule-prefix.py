# THE CLIP RULE AS A PREFIX, measured by its own unit test rather than through a lane.
# Reddens: unit: clip-keys.test.ts "refuses a key that starts with the prefix and walks out of it"
import io
p = '/home/user/rundesk/apps/api/src/modules/clips/clip-keys.ts'
a = '  return isKeyDirectlyUnder(key, clipPrefix(workspaceId))\n'
b = "  return typeof key === 'string' && key.startsWith(clipPrefix(workspaceId))\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("clk-1-clip-rule-prefix: applied")
