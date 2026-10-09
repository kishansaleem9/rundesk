# THE NEW SECTION'S EMOJI IS NOT SENT.
# (`commit-log/log-716d25c-1`, `ledger-rows/row-835`)
# Reddens: planner-rail-sections: "“+ Add a new section” makes a section with its name and emoji: the Sidebar page lists it, the rail draws it at its foot under that heading, and the server holds it"
import io
p = '/home/user/rundesk/apps/web/src/components/planner-settings-dialog.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('addSection.mutate({ name, emoji: newSection.emoji.trim() || null })',
     'addSection.mutate({ name, emoji: null }) // BROKEN: no emoji'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('prs-w2-the-emoji-is-not-sent: the emoji is not sent')
