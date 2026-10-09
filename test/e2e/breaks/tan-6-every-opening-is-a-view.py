# EVERY OPENING IS A VIEW: a reload counts again.
# (`ledger-rows/section3-team-analytics`)
# Reddens: teams-analytics: "a task opened twice in five minutes is one view, a second task another, and a task in a private list the member is not in is refused (403) and not counted (read by SQL)"
#   or "turned on, it answers a member each person’s task views, their activity and their Lineup in the period, as the database holds them, and their status"
#   or "the Analytics tab draws a row a member — not the guest — with the member’s two task views, their Lineup and both tasks named, and the team’s roll-up"
#
# Re-aimed 8 October: the last 2 of these are knock-ons of the same edit, measured on lane 1 — checks that stand on what the first ones lost.
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    if (recent) return { logged: false }\n    await this.db.insert(taskViewEvents)',
     '    void recent // BROKEN: every opening is a view\n    await this.db.insert(taskViewEvents)'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tan-6-every-opening-is-a-view: every opening is a view')
