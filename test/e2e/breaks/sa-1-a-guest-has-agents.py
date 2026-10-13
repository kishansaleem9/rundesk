# Guests reach Super Agents: the guest refusal is gone.
# Reddens only where a model answers: every agent answers through the model, and the suite stops where none is configured.
# Reddens: super-agents: "a guest is refused the workspace’s Super Agents (403), as in ClickUp"
import io
p = '/home/user/rundesk/apps/api/src/modules/super-agents/super-agents.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "    if (row.role === 'guest') throw new ForbiddenException('Guests have no Super Agents')\n"
b = ''
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sa-1-a-guest-has-agents: Guests reach Super Agents: the guest refusal is gone.')
