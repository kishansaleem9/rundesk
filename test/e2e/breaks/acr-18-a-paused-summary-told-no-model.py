# A PAUSED WORKSPACE'S STREAMED SUMMARY IS TOLD THE SERVER HAS NO MODEL: the month's credits
# are asked only where a model answers (`found-13-oct/a-refused-chat-turn-never-ends`).
# Reddens only where no model answers: with a model `summarizeStream` asks them before its stream opens.
# Reddens: ai-credits: "and so is a summary streamed, whatever the server has (402)"
import io
c = '/home/user/rundesk/apps/api/src/modules/ai/ai.controller.ts'
s = io.open(c, encoding='utf-8').read()
a = "      await this.ai.assertWithinCredits('summarize', { userId: user.id, workspaceId: body.workspaceId })\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {c}, expected exactly 1'
io.open(c, 'w', encoding='utf-8').write(s.replace(a, ''))
print('acr-18-a-paused-summary-told-no-model: the credits are asked only where a model answers')
