# A ninth item: create a Space inside a Space, which has nowhere to go.
#
# Reddens: space-create-menu: "and Space is not among them — a space does not nest in a space"
import io
p='/home/user/rundesk/apps/web/src/lib/create-types.ts'
s=io.open(p,encoding='utf-8').read()
a="blurbKey: 'createMenu.blurbSpace', inSpace: false"
assert s.count(a)==1
io.open(p,'w',encoding='utf-8').write(s.replace(a,"blurbKey: 'createMenu.blurbSpace', inSpace: true"))
