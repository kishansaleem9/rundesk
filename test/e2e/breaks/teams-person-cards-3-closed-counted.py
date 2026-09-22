# Finished work counts as current work: the status filter comes off, so a
# person's card lists what they have already shipped and their number grows.
# Reddens: teams-person-cards "the counts are each person's own (2 and 3)",
#   "work that is finished is not what somebody is working on", and the card
#   counts on screen.
import io
p='/home/user/rundesk/apps/api/src/modules/workspace-groups/workspace-groups.service.ts'
s=io.open(p,encoding='utf-8').read()
a="          ne(tasks.statusCategory, 'closed'),\n"
assert s.count(a)==1
io.open(p,'w',encoding='utf-8').write(s.replace(a,""))
