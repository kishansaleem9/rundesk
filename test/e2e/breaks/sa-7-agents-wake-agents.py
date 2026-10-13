# An agent’s own comment starts the agents it names.
# Reddens only where a model answers: every agent answers through the model, and the suite stops where none is configured.
# Reddens: super-agents: "an agent’s answer that mentions another agent does not start it — no loop between agents"
import io
p = '/home/user/rundesk/apps/api/src/modules/super-agents/super-agents.runner.ts'
s = io.open(p, encoding='utf-8').read()
a = '  async onComment(e: CommentEvent) {\n    if (await this.isAgentAccount(e.authorId)) return\n'
b = '  async onComment(e: CommentEvent) {\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sa-7-agents-wake-agents: An agent’s own comment starts the agents it names.')
