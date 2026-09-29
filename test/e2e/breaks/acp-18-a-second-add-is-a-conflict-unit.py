# ADDING A TASK THAT IS ALREADY ON THE LIST IS REFUSED AS A CONFLICT, asked of the service itself (`ledger-rows/row-850`).
# Reddens: unit: people.service.test.ts "answers a task already on their list with the row that is there, not a second one"
import io
p = '/home/user/rundesk/apps/api/src/modules/people/people.service.ts'
a = "      if ((err as { code?: string })?.code === '23505') {\n"
b = "      if ((err as { code?: string })?.code === 'never') {\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('acp-18-a-second-add-is-a-conflict-unit: a duplicate add rethrows')
