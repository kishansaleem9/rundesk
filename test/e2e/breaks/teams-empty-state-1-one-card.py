# One explainer card instead of the frame's two.
# Reddens: teams-empty-state "there are the frame's two explainer cards"
# (and the second card's title/body check, which then reads nothing).
import io
p='/home/user/rundesk/apps/web/src/pages/workspace-teams-page.tsx'
s=io.open(p,encoding='utf-8').read()
a="                  ).map((card) => ("
assert s.count(a)==1
io.open(p,'w',encoding='utf-8').write(s.replace(a,"                  ).slice(0, 1).map((card) => ("))
