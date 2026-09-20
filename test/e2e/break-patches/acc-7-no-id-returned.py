# The action succeeds and says so, but hands back nothing addressable — leaving the
# sentence as the only account of what happened, which is where this row started.
# Reddens: ai-create-containers: "and hands back the id of what it made"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai.service.ts'
a = """          container: {
            kind: result.kind,
            id: result.id,
            name: result.name,
            path: result.path,
            spaceId: result.spaceId,
          },
"""
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai.service.ts: a created container is no longer reported by id.')
