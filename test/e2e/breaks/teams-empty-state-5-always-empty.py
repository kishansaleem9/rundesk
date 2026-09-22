# The empty state renders whether or not there are teams — the one failure a
# suite that only ever looks at the empty condition cannot see, because a page
# that is always empty and a page that is correctly empty are the same pixels.
# Reddens: teams-empty-state "the empty state gives way now that there is
#   something to show".
import io
p='/home/user/rundesk/apps/web/src/pages/workspace-teams-page.tsx'
s=io.open(p,encoding='utf-8').read()
a="{groups.length === 0 ? ("
assert s.count(a)==1
io.open(p,'w',encoding='utf-8').write(s.replace(a,"{groups.length >= 0 ? ("))
