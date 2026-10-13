# The Create menu offers no Super Agent.
# Reddens only where a model answers: every agent answers through the model, and the suite stops where none is configured.
# Reddens: super-agents: "the Create menu makes a Super Agent: it opens the new-agent page"
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
s = io.open(p, encoding='utf-8').read()
a = '      {role !== \'guest\' && (\n        <button\n          type="button"\n          data-testid="create-footer-super-agent"'
b = '      {role === \'nobody\' && (\n        <button\n          type="button"\n          data-testid="create-footer-super-agent"'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sa-28-no-super-agent-in-the-create-menu: The Create menu offers no Super Agent.')
