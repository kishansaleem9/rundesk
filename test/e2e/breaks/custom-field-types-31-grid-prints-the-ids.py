# The cell prints the raw ids it was handed. This is what the column did before
# 0158, and it reads like data.
# Reddens: custom-field-types: "and it says how many, never the ids"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
a = "    return t('list.table.cellSelected', { n: value.length })\n"
b = "    return value.join(', ')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('list route: a list-valued cell prints its ids again.')
