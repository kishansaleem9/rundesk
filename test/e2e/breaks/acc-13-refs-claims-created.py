# The reference read goes back to Nest's default 201 for a POST, so hydrating the
# chips in an answer announces "Created" on every render — wrong in the access log,
# wrong for any client branching on the status, and indistinguishable from the
# create path this suite is about. This is the defect the suite actually found.
# Reddens: ai-create-containers: "the list the AI made resolves through /ai/refs, and the read answers 200 rather than \"Created\""Created""
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai.controller.ts'
a = "  @HttpCode(HttpStatus.OK)\n  @ApiOperation({ summary: 'Resolve task/list references in an AI answer (live titles and statuses)' })\n"
b = "  @ApiOperation({ summary: 'Resolve task/list references in an AI answer (live titles and statuses)' })\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai.controller.ts: /ai/refs answers 201 Created for a read again.')
