# THE COMMANDS TAB SAYS A REFUSAL BY ITS CODE.
# (`ledger-rows/row-2294`)
# Reddens: ai-connected-apps: "a calendar whose grant the provider refuses at the confirm is said so in words — connect it again — and the event is not written"
#
# `reconnect`, where the sentence says the calendar's grant was refused and to connect it again.
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-ai-page.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('                        : res.message\n                          ? // The refusal in its own words, which the code beside it only names.\n',
     '                        : res.message && !res.reason\n                          ? // The refusal in its own words, which the code beside it only names.\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('aic-11-the-refusal-said-by-its-code: a refusal is shown by its code')
