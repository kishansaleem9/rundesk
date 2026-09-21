# Browse People becomes a dead control: it still renders, still says the same
# thing, and does nothing.
# Reddens: teams-empty-state "Browse People lands on All People, with people on
# it" and "the empty state is behind us rather than still underneath".
import io
p='/home/user/rundesk/apps/web/src/pages/workspace-teams-page.tsx'
s=io.open(p,encoding='utf-8').read()
a="""                      onClick={() => {
                        // Carry no leftover team search into the people list.
                        setSearch('')
                        setTab('people')
                      }}
"""
assert s.count(a)==1
io.open(p,'w',encoding='utf-8').write(s.replace(a,"                      onClick={() => {}}\n"))
