# A CHAT TURN IS REFUSED ONLY AFTER ITS STREAM OPENED (`found-13-oct/a-refused-chat-turn-never-ends`):
# the hour's limits and the month's credits are asked inside `chatStream` again, past the hijack.
# Reddens: ai-credits: "and a chat turn is refused the same way, before anything streams and whatever the server has — not left open (402)"
#
# With a model the refusal reaches nobody and the turn is left open; without one, the 503 goes first.
import io
c = '/home/user/rundesk/apps/api/src/modules/ai/ai.controller.ts'
s = io.open(c, encoding='utf-8').read()
a = "    await this.ai.assertWithinRateLimit(asker, new Date(), 'chat')\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {c}, expected exactly 1'
io.open(c, 'w', encoding='utf-8').write(s.replace(a, ''))
v = '/home/user/rundesk/apps/api/src/modules/ai/ai.service.ts'
s = io.open(v, encoding='utf-8').read()
a = "    if (!opened) await this.assertWithinRateLimit(ctx, new Date(), 'chat')\n"
b = "    await this.assertWithinRateLimit(ctx, new Date(), 'chat')\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {v}, expected exactly 1'
io.open(v, 'w', encoding='utf-8').write(s.replace(a, b))
print('acr-16-a-chat-turn-refused-after-it-streams: the limits are asked after the stream opened')
