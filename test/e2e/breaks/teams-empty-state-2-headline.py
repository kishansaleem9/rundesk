# The headline falls back to the page subtitle — the shape a missing i18n key
# produces, and the one an "a headline is present" check cannot see.
# Reddens: teams-empty-state "the headline is the frame's headline".
import io
p='/home/user/rundesk/apps/web/src/pages/workspace-teams-page.tsx'
s=io.open(p,encoding='utf-8').read()
a="{t('teams.emptyHeadline')}"
assert s.count(a)==1
io.open(p,'w',encoding='utf-8').write(s.replace(a,"{t('teams.subtitle')}"))
