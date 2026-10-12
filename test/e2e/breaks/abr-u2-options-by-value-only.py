# A DROPDOWN’S ANSWER IS MATCHED BY ITS VALUE ONLY.
# (`commit-log/log-c980bee-1`, `ledger-rows/row-719`)
# Reddens: unit: ai-field.test.ts "a dropdown stores one of its options, matched by label or value, and refuses any other answer"
#
# An option named by its label is not found.
import io
p = '/home/user/rundesk/apps/api/src/modules/custom-fields/ai-field.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("      opts.find((o) => o.label.trim().toLowerCase() === bare) ??\n",
     ""),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('abr-u2-options-by-value-only: A DROPDOWN’S ANSWER IS MATCHED BY ITS VALUE ONLY.')
