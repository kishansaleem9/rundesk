# The unconfigured refusal stops being a status code: the caller gets 200 and has to
# parse the body to discover the feature is off — which is how "a disabled thing was
# accepted" gets recorded by every check that reads the status.
# Reddens only where no model answers: with a model the route never reaches its 503.
# RE-AIMED 13 October: the route names its asker once (`found-13-oct/a-refused-chat-turn-never-ends`); the refusal is the same.
# Reddens: ai-create-containers: "and /ai/chat agrees too, before opening a stream, so a refusal is a status code rather than a message inside one"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai.controller.ts'
a = """      await this.ai.recordFailure('chat', 'none', asker, 'not_configured', 'AI features are not configured')
      res.status(503).send({ error: 'AI features are not configured' })
"""
b = """      await this.ai.recordFailure('chat', 'none', asker, 'not_configured', 'AI features are not configured')
      res.status(200).send({ error: 'AI features are not configured' })
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai.controller.ts: /ai/chat now answers 200 when no model is configured.')
