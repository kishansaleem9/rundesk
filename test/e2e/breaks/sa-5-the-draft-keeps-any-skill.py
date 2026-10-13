# The builder keeps a skill that is not one of the offered tools.
# Reddens only where a model answers: every agent answers through the model, and the suite stops where none is configured.
# Reddens: super-agents: "the builder’s draft keeps the profile’s own values (a skill that is not one is dropped) and saves nothing"
import io
p = '/home/user/rundesk/apps/api/src/modules/super-agents/super-agents.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "    const skills = Array.isArray(draft.skills) ? [...new Set(draft.skills.filter((k): k is string => typeof k === 'string' && offered.has(k)))] : []"
b = "    const skills = Array.isArray(draft.skills) ? [...new Set(draft.skills.filter((k): k is string => typeof k === 'string'))] : []"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sa-5-the-draft-keeps-any-skill: The builder keeps a skill that is not one of the offered tools.')
