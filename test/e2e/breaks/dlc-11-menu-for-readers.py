# THE DOC'S MENU IS DRAWN FOR EVERY READER, empty below Edit.
# Reddens: doc-level-controls: "a member with a View share is shown the doc read only — the editor takes no typing, and no Save, formatting, Archive or Delete is offered"
#   or "a member with a Comment share is shown the doc read only — the editor takes no typing, and no Save, formatting, Archive or Delete is offered"
import io
p = '/home/user/rundesk/apps/web/src/components/docs-panel.tsx'
s = io.open(p, encoding='utf-8').read()
a = '              {(mayEdit || mayDelete) && (\n                <DropdownMenu>'
b = '              {(mayEdit || mayDelete || Boolean(1)) && (\n                <DropdownMenu>'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('dlc-11-menu-for-readers: the menu is drawn for readers')
