# The builder’s draft never reaches the form.
# Reddens only where a model answers: every agent answers through the model, and the suite stops where none is configured.
# Reddens: super-agents: "New Super Agent: the builder fills the form, and Create makes the agent from it and opens its profile"
import io
p = '/home/user/rundesk/apps/web/src/components/super-agents/super-agents-hub.tsx'
s = io.open(p, encoding='utf-8').read()
a = '    onSuccess: (d) => setDraft({ ...EMPTY_DRAFT, ...d }),'
b = '    onSuccess: () => setDraft({ ...EMPTY_DRAFT }),'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sa-24-the-builder-fills-nothing: The builder’s draft never reaches the form.')
