# ANALYTICS IS ON WHATEVER THE CLICKAPP SAYS.
# (`ledger-rows/section3-team-analytics`)
# Reddens: teams-analytics: "Analytics is off until turned on: the admin is told so and may turn it on, a member is told so and may not, and a guest is refused in words (403)"
#   or "the admin’s audience is saved from the page and a member opening Analytics then reads why not; turned off from the page, it says it is off and offers the admin Turn on again (read by SQL)"
#
# Re-aimed 8 October: the last 1 of these are knock-ons of the same edit, measured on lane 1 — checks that stand on what the first ones lost.
import io
p = '/home/user/rundesk/apps/api/src/modules/team-analytics/team-analytics.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("    const enabled = await this.flags.isEnabled(FLAGS.TEAMS_ANALYTICS, { workspaceId, userId: reader.id, role: reader.role ?? '' })\n",
     "    const enabled = (await this.flags.isEnabled(FLAGS.TEAMS_ANALYTICS, { workspaceId, userId: reader.id, role: reader.role ?? '' })) || true // BROKEN: on whatever the ClickApp\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tan-3-on-whatever-the-clickapp: on whatever the clickapp')
