# THE THIRD TEAMS CARD SAYS OUR OWN WORDS, NOT CLICKUP'S.
# (`commit-log/log-6f62af6-1`)
# Reddens: teams-empty-state: "the third card says what ClickUp says Priorities in Teams Hub are for: your team and manager see what you’re focused on"
#
# The tail the frame cut off is written back as it was before ClickUp's sentence.
import io
p = '/home/user/rundesk/apps/web/src/lib/i18n/catalogs.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("""  'teams.cardFocusBody': "Your Personal Priorities are displayed in Teams Hub, so your team and manager can see what you're focused on.",""",
     """  'teams.cardFocusBody': "Instantly know what each team is working on and what's next on their plate.","""),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("teams-empty-state-7-the-third-card-ours: THE THIRD TEAMS CARD SAYS OUR OWN WORDS, NOT CLICKUP'S.")
