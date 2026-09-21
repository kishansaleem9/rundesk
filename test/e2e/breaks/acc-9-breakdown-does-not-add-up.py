# The total stops being the sum of the buckets — the "confident zero" with extra
# steps: every individual number still looks plausible and the whole is wrong.
# Reddens: ai-create-containers: "and its two breakdowns each add up to its own total"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai.service.ts'
a = """      const n = Number(r.count) || 0
      total += n
"""
b = """      const n = Number(r.count) || 0
      total += 1
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai.service.ts: the status breakdown counts distinct statuses as if they were tasks.')
