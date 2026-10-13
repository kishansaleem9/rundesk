# WHAT A SEARCH OF THE CONNECTED APPS FOUND IS LEFT OUT OF THE PLAN.
# (`ledger-rows/row-2294`)
# Reddens: unit: ai-connected.test.ts "previews an event and a draft as actions, and keeps what a search found"
#
# The model was shown it; the plan the person reads has none of it.
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai-command.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('        if (found.refusal) warnings.push(`Did not search your connected apps: ${found.refusal}.`)\n        else connectedResults.push(found)\n',
     '        if (found.refusal) warnings.push(`Did not search your connected apps: ${found.refusal}.`)\n        else connectedResults.push({ ...found, hits: [] })\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('aic-u4-a-search-forgotten: what a search found is left out of the plan')
