# The search box stops filtering: every member is listed whatever is typed.
#
# A search box in name only — the frame's *"Search or enter email…"* over a
# control that ignores what you put in it. In a workspace of seventy, typing a
# colleague's name leaves seventy rows and the twenty-row cap decides which of
# them you can see, so the picker is back to being incapable while looking
# busier about it.
#
# `!needle ||` is the first clause of a three-clause filter and the one that
# reads as a short-circuit for the empty case. Dropping it does not make the
# filter accept everything; dropping the two clauses AFTER it does, which is
# what this patch models — `members.filter(() => true)` is the same thing said
# once.
#
# ONE CHECK, THE NARROWING ONE. "all assignable members are listed" passes,
# because they are; the invitation checks pass, because `canInvite` is computed
# from the query rather than from the list. Only "searching a single person
# narrows the list to exactly them" fails — the check the suite added after its
# first version passed against a list capped at eight.
#
# Reddens: assignee-picker: "and searching a single person narrows the list to exactly them"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = """    const scored = members.filter(
      (m) =>
        !needle ||
        (m.displayName ?? '').toLowerCase().includes(needle) ||
        m.email.toLowerCase().includes(needle),
    )
"""
b = """    const scored = members.filter(() => true)
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('task-detail-sheet.tsx: the assignee search no longer filters anybody out.')
