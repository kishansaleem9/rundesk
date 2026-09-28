# The planner is asked a constant question instead of the one the person typed.
# Reddens: create-menu-ai: "carrying the TYPED TEXT as the message — the box is the prompt, not a label over a filter"
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = "      api<AiPlan>('/ai/command', { method: 'POST', body: { workspaceId, message: text } }),\n"
b = "      api<AiPlan>('/ai/command', { method: 'POST', body: { workspaceId, message: 'create something' } }),\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('quick-create-modal.tsx: The planner is asked a constant question instead of the one the person typed.')
