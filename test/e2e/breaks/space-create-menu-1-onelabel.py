# Folder wearing List's label — the menu still has eight items, each labelled,
# and one of them is wrong. A presence check passes; the per-item check does not.
#
# Reddens: space-create-menu: "and they are the create kinds, in the shared module"
import io
p='/home/user/rundesk/apps/web/src/lib/create-types.ts'
s=io.open(p,encoding='utf-8').read()
a="labelKey: 'quickCreate.tab.folder'"
assert s.count(a)==1
io.open(p,'w',encoding='utf-8').write(s.replace(a,"labelKey: 'quickCreate.tab.list'"))
