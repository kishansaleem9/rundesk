# THE TEAMS HUB HAS NO ANALYTICS TAB, as before.
# (`ledger-rows/section3-team-analytics`)
# Reddens: teams-analytics: "the Analytics tab draws a row a member — not the guest — with the member’s two task views, their Lineup and both tasks named, and the team’s roll-up"
#   or "the arrows move the period — no further on than this week — and the week before shows the other member’s older view; a name searched leaves that person alone"
#   or "the admin’s audience is saved from the page and a member opening Analytics then reads why not; turned off from the page, it says it is off and offers the admin Turn on again (read by SQL)"
#
# Re-aimed 8 October: the last 2 of these are knock-ons of the same edit, measured on lane 2 — checks that stand on what the first ones lost.
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-teams-page.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("            { id: 'analytics', labelKey: 'teams.tabAnalytics', icon: BarChart3 },\n",
     '            // BROKEN: no Analytics tab\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tan-w1-the-tab-is-absent: the tab is absent')
