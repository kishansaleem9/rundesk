# The starter cards stop looking at anything: the first four of the catalogue, every
# time, for everyone. This is exactly what was there before — five const translation
# keys with no input that could change them — wearing the new shape.
# Reddens: ai-answer-rendering: "and "Find Blockers" now names exactly two more overdue tasks than before"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai-starters.ts'
a = """    const because = candidate.when(facts)
    if (because === null) continue
    out.push({ ...candidate.card, because })"""
b = """    out.push({ ...candidate.card, because: 'always' })"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai-starters.ts: the same four cards now come back whatever the facts are.')
