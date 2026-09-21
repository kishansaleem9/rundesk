# The reported path is built from what was asked for rather than from the space the
# row actually landed in — so a list created one space over still reads correctly in
# the answer, which is the failure nobody goes looking for.
# Reddens: ai-create-containers: "the path it reports names the space it really went into"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai.service.ts'
a = """      spaceName: space.name,
      path: containerPath(space.name, created.name),
      statuses: statusRows.map((s) => s.key),
"""
b = """      spaceName: space.name,
      path: containerPath('workspace', created.name),
      statuses: statusRows.map((s) => s.key),
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai.service.ts: the created list reports a path that does not name its space.')
