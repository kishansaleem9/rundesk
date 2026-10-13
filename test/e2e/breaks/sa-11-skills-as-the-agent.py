# What an agent does is done as its own account, not as the person it acts for.
# Reddens only where a model answers: every agent answers through the model, and the suite stops where none is configured.
# Reddens: super-agents: "a Skill the agent uses is carried out as Mia, who started it: the task is hers, in her list"
import io
p = '/home/user/rundesk/apps/api/src/modules/super-agents/super-agents.runner.ts'
s = io.open(p, encoding='utf-8').read()
a = '        const results = await this.ai.executeActions(turn.plan.actions, actorId)'
b = '        const results = await this.ai.executeActions(turn.plan.actions, agent.userId)'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sa-11-skills-as-the-agent: What an agent does is done as its own account, not as the person it acts for.')
