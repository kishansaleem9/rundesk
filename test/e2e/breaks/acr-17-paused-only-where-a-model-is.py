# A PAUSED WORKSPACE'S CHAT TURN IS TOLD THE SERVER HAS NO MODEL: the hour's limits and the
# month's credits are asked after the 503, so where no model answers they are never asked.
# Reddens only where no model answers: with a model they are still asked before the stream opens.
# Reddens: ai-credits: "and a chat turn is refused the same way, before anything streams and whatever the server has — not left open (402)"
import io
c = '/home/user/rundesk/apps/api/src/modules/ai/ai.controller.ts'
s = io.open(c, encoding='utf-8').read()
ask = "    await this.ai.assertWithinRateLimit(asker, new Date(), 'chat')\n"
end = "      await this.ai.recordFailure('chat', 'none', asker, 'not_configured', 'AI features are not configured')\n      res.status(503).send({ error: 'AI features are not configured' })\n      return\n    }\n"
assert s.count(ask) == 1, f'anchor appears {s.count(ask)} times in {c}, expected exactly 1'
assert s.count(end) == 1, f'anchor appears {s.count(end)} times in {c}, expected exactly 1'
s = s.replace(ask, '').replace(end, end + ask)
io.open(c, 'w', encoding='utf-8').write(s)
print('acr-17-paused-only-where-a-model-is: the limits are asked after the 503')
