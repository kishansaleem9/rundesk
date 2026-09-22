# "My Teams" lists every team in the workspace instead of the ones you are in.
#
# `myTeams` drops its membership filter, so the panel below the rule becomes a
# second copy of the panel above it. The frame separates them with a rule
# precisely because they answer different questions — All Teams is the
# organisation, My Teams is you — and a panel that answers the first while
# labelled the second is the duplicated-list defect with a heading on it.
#
# It also takes the frame's one piece of verbatim copy out of reach. "Once you
# are added to a team you will see it here" is the sentence the video hands
# over word for word, and it renders only when `myTeams` is empty — which, in
# any workspace that has a team, it now never is. The check that reads that
# sentence is the one that fails.
#
# `groups.filter(…)` inside a `useMemo` guarded by `me ? … : []` is a shape
# where the filter reads as the optional part: the guard is about whether we
# know who the viewer is, and the predicate looks like a refinement of it.
#
# ONE CHECK. The panel still renders, so the check above it passes; All Teams,
# All People and the org chart are untouched; the tab count is unchanged. Only
# the empty state that was supposed to be on screen is not.
#
# Reddens: teams-destination: "a member in no team is told so, in the frame’s own words"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-teams-page.tsx'
a = "    () => (me ? groups.filter((g) => (g.members ?? []).some((m) => m.userId === me.id)) : []),"
b = "    () => (me ? groups : []),"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-teams-page.tsx: My Teams now lists every team in the workspace.')
