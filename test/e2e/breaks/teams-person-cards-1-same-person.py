# THE FACADE, and the patch this whole suite exists to be caught by: every card
# draws the FIRST person's preview, under everybody else's name and face. Each
# card is individually plausible; only reading two of them shows it.
# Reddens: teams-person-cards "the second card lists the second person's",
#   "and neither card is showing the other person’s work", "each card's count is its
#   own person's (2 and 3)", "and the numbered rows are that many", and the empty
#   card for somebody with nothing on.
import io
p='/home/user/rundesk/apps/web/src/pages/workspace-teams-page.tsx'
s=io.open(p,encoding='utf-8').read()
a="                  const preview = previewByUser.get(m.userId)"
assert s.count(a)==1
io.open(p,'w',encoding='utf-8').write(s.replace(a,"                  const preview = previewByUser.get(shownMembers[0]?.userId ?? m.userId)"))
