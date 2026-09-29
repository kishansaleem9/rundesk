# A GUEST PUTS TASKS ON A MEMBER'S PRIORITIES.
#
# `ledger-rows/row-850`. The guest refusal goes. ClickUp is plain about it —
# "Members, Admins, and Owners can add tasks to other people's priorities" —
# and a guest is none of the three: somebody given one shared space would be
# filling the days of the people who work there. The web never offers a guest
# the prompt, so only a client that asks the route directly sees it, which is
# exactly the client a server rule is for.
#
# ONE CHECK. The suite's guest may open the task (the space is shared with them
# to view), so what refused them was being a guest and nothing else; without
# the rule the add answers 201 and the row is on the teammate's list.
#
# Reddens: assign-to-priorities: "a guest may not add to a colleague's priorities (403), though the task is open to them"
import io
p = '/home/user/rundesk/apps/api/src/modules/people/people.service.ts'
a = """    if (callerRole === 'guest') {
      throw new ForbiddenException("A guest cannot add tasks to somebody else's priorities")
    }
"""
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('acp-11-a-guest-adds-to-a-colleagues-list: a guest may add to anybody\'s priorities')
