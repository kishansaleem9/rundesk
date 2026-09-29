# WHOEVER ADDED A PRIORITY CAN TAKE IT OFF THE OWNER'S LIST.
#
# `ledger-rows/row-850`. Removing a row asks for its owner OR the one who added
# it — the natural next step once rows record their adder, and the step that
# undoes the rule the colleague half was built on: a colleague may put a task
# in front of you, and what happens to it after that is yours. With this, a
# manager's "add" is also a "take away", on a list its owner thought was theirs.
#
# ONE CHECK: the adder's DELETE, answered 404 with the row left in place.
#
# Reddens: assign-to-priorities: "and it is theirs now: the one who added it cannot take it off (404)"
import io
p = '/home/user/rundesk/apps/api/src/modules/people/people.service.ts'
a = """      .delete(userPriorities)
      .where(and(eq(userPriorities.id, priorityId), eq(userPriorities.userId, userId)))
"""
b = """      .delete(userPriorities)
      .where(and(eq(userPriorities.id, priorityId), or(eq(userPriorities.userId, userId), eq(userPriorities.addedById, userId))))
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('acp-19-whoever-added-it-takes-it-off: the adder may remove a row from the owner\'s list')
