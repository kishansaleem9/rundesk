# Every item opens the modal on its default tab — "it opened something" is not
# "it landed on the right thing".
import io
p='/home/user/rundesk/apps/web/src/components/workspace-sidebar.tsx'
s=io.open(p,encoding='utf-8').read()
a="          initialMode={spaceCreate.kind}\n"
assert s.count(a)==1
io.open(p,'w',encoding='utf-8').write(s.replace(a,''))
