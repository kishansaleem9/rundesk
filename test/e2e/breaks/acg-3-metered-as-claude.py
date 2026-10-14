# CHATGPT'S TURN IS METERED AS CLAUDE'S.
# (`commit-log/log-39863ff-1`)
#
# The run is written down under the default Claude model, so the activity log,
# the AI value page and the credits all say Claude answered and price it as
# Claude — while OpenAI did, at OpenAI's price.
#
# Reddens: ai-chatgpt-answers: "the turn is written down as one run of chat under OpenAI’s model, its tokens counted"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai.service.ts'
a = "        void this.recordUsage('chat', model, ctx, final?.usage?.input_tokens ?? 0, final?.usage?.output_tokens ?? 0)"
b = "        void this.recordUsage('chat', 'claude-sonnet-4-6', ctx, final?.usage?.input_tokens ?? 0, final?.usage?.output_tokens ?? 0)"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai.service.ts: every chat run is recorded under Claude Sonnet.')
