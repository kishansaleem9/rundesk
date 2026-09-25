# THE KNOWLEDGE BASE REFUSES BY THE ACCOUNT'S ROLE AGAIN, as the retired guard did on the AI routes.
# Reddens: time-tracking-readers: "an account marked guest on its own, and a member of the workspace, is what the workspace makes it: it tracks time and asks the knowledge base"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai.controller.ts'
a = "    await this.ai.assertWorkspaceMember(body.workspaceId, user.id)\n    const answer = await this.ai.answerKnowledge(body.workspaceId, user.id, body.question, {\n"
b = "    if (user?.role === 'guest') throw new HttpException('Guests cannot use this feature', HttpStatus.FORBIDDEN)\n    await this.ai.assertWorkspaceMember(body.workspaceId, user.id)\n    const answer = await this.ai.answerKnowledge(body.workspaceId, user.id, body.question, {\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("ttr-4-ai-refuses-by-account-role: the knowledge base asks the account's role")
