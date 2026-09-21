# The description box goes back to its old sentence, which promises no AI and offers none.
# Reddens: create-menu-ai: the description box carries the frame's placeholder
import io
p = '/home/user/rundesk/apps/web/src/lib/i18n/catalogs.ts'
a = "  'quickCreate.descriptionPlaceholder': 'Add description, or write with ⚡AI',\n"
b = "  'quickCreate.descriptionPlaceholder': 'Description — what does done look like?',\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('catalogs.ts: The description box goes back to its old sentence, which promises no AI and offers none.')
