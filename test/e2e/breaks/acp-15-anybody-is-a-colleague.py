# SOMEBODY OUTSIDE THE WORKSPACE IS TAKEN FOR A COLLEAGUE.
#
# `ledger-rows/row-850`. The membership rule goes: a person the workspace does
# not hold is given a member's shape and the add carries on to the task. It is
# still refused — the task read asks membership too — but as a 403 about the
# task ("That person cannot open this task") instead of the 404 every other
# route here gives a person who is not in the workspace. So the answer tells a
# caller that the id is somebody real who is merely kept out, which is the
# thing a profile's 404 exists not to say.
#
# ONE CHECK: the outsider, answered 404 with its own sentence.
#
# Reddens: assign-to-priorities: "nor add to somebody who is not in the workspace (404)"
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
print('acp-15-anybody-is-a-colleague: a person outside the workspace is treated as a member')
