# The menu item opens the creator and forgets which space it was opened from.
import io
p='/home/user/rundesk/apps/web/src/components/workspace-sidebar.tsx'
s=io.open(p,encoding='utf-8').read()
a="          initialSpaceId={spaceCreate.spaceId}\n"
assert s.count(a)==1
io.open(p,'w',encoding='utf-8').write(s.replace(a,''))
