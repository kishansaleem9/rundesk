# SOMEBODY OUTSIDE THE WORKSPACE IS TAKEN FOR A COLLEAGUE, asked of the service itself (`ledger-rows/row-850`).
# Reddens: unit: people.service.test.ts "does not find a colleague who is not in the workspace (404), and writes nothing"
import io
p = '/home/user/rundesk/apps/api/src/modules/people/people.service.ts'
a = """    const target = members.get(userId)
    if (!target) throw new NotFoundException('That person is not in this workspace')
"""
b = """    const target = members.get(userId) ?? { userId, role: 'member' as const, platformRole: 'member' as const, displayName: '' }
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('acp-16-anybody-is-a-colleague-unit: a person outside the workspace is treated as a member')
