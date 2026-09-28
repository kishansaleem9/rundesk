# The card draws one item however many the person has — the numbered list the
# frame shows, truncated to a single row, while the count beside it still says
# the real number.
# Reddens: teams-person-cards "the first card lists the first person's work",
#   "the second card lists the second person's", "and the numbered rows are that many".
import io
p='/home/user/rundesk/apps/web/src/pages/workspace-teams-page.tsx'
s=io.open(p,encoding='utf-8').read()
a="{(preview?.items ?? []).map((item, index) => ("
assert s.count(a)==1
io.open(p,'w',encoding='utf-8').write(s.replace(a,"{(preview?.items ?? []).slice(0, 1).map((item, index) => ("))
