# The unconfigured refusal stops being a status code: the caller gets 200 and has to
# parse the body to discover the feature is off — which is how "a disabled thing was
# accepted" gets recorded by every check that reads the status.
# Reddens: ai-create-containers: "and /ai/chat answers 503 before opening a stream"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai.controller.ts'
a = """      await this.ai.recordFailure('chat', 'none', { userId: user.id, workspaceId: body.workspaceId }, 'not_configured', 'AI features are not configured')
      res.status(503).send({ error: 'AI features are not configured' })
"""
b = """      await this.ai.recordFailure('chat', 'none', { userId: user.id, workspaceId: body.workspaceId }, 'not_configured', 'AI features are not configured')
      res.status(200).send({ error: 'AI features are not configured' })
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai.controller.ts: /ai/chat now answers 200 when no model is configured.')
