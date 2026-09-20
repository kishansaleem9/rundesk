# The `team` row falling back to a SIBLING's string — two rows both "List",
# which is what the missing entry produced before `viewLabelKey` returned null.
import io
p='/home/user/rundesk/apps/web/src/lib/space-views.ts'
s=io.open(p,encoding='utf-8').read()
a="  team: 'list.viewTeam',"
assert s.count(a)==1
io.open(p,'w',encoding='utf-8').write(s.replace(a,"  team: 'list.viewList',"))
