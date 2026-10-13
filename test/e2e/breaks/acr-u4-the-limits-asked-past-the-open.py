# THE HOUR'S LIMITS AND THE MONTH'S CREDITS ARE ASKED JUST PAST THE STREAM'S OPEN
# (`found-13-oct/a-refused-chat-turn-never-ends`): the reply is hijacked first, so a refusal reaches nobody.
# Reddens: unit: apps/api/src/modules/ai/chat-trace.test.ts "refuses a turn past the hour's limit with a status code, having written nothing"
#   or "refuses a turn in a workspace whose credits are spent in the same words, whatever the server has"
import io
c = '/home/user/rundesk/apps/api/src/modules/ai/ai.controller.ts'
s = io.open(c, encoding='utf-8').read()
ask = "    await this.ai.assertWithinRateLimit(asker, new Date(), 'chat')\n"
opened = "    const stream = openSseStream(res)\n"
assert s.count(ask) == 1, f'anchor appears {s.count(ask)} times in {c}, expected exactly 1'
assert s.count(opened) == 1, f'anchor appears {s.count(opened)} times in {c}, expected exactly 1'
s = s.replace(ask, '').replace(opened, opened + ask)
io.open(c, 'w', encoding='utf-8').write(s)
print('acr-u4-the-limits-asked-past-the-open: the limits are asked after the reply is hijacked')
