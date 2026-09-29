# ADDING A TASK THAT IS ALREADY ON THE LIST IS REFUSED AS A CONFLICT.
#
# `ledger-rows/row-850`. The unique index on (owner, workspace, task) still
# keeps one row, and the answer to "somebody making sure" goes: the duplicate
# key reaches the global filter and comes back 409 "That resource already
# exists". The one who assigned it and the owner who added it themself race
# for the same row every time a prompt is answered on both sides; the loser is
# told something failed when nothing did.
#
# ONE CHECK: the second add, which answers with the same entry, and one row.
#
# Reddens: assign-to-priorities: "adding it again answers with the same entry, and their list still holds one row for it"
import io
p = '/home/user/rundesk/apps/api/src/modules/people/people.service.ts'
a = "      if ((err as { code?: string })?.code === '23505') {\n"
b = "      if ((err as { code?: string })?.code === 'never') {\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('acp-17-a-second-add-is-a-conflict: a duplicate add answers 409')
