# SENTIMENT KEEPS WHATEVER WAS ANSWERED.
# (`commit-log/log-c980bee-1`, `ledger-rows/row-719`)
# Reddens: unit: ai-field.test.ts "sentiment is one of its three words; text is one line; nothing is never stored"
#
# An answer that is none of the three words is kept as it is.
import io
p = '/home/user/rundesk/apps/api/src/modules/custom-fields/ai-field.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("    return word\n      ? { value: word }\n      : { refused:",
     "    return word || said\n      ? { value: word ?? said }\n      : { refused:"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('abr-u1-sentiment-any-word: SENTIMENT KEEPS WHATEVER WAS ANSWERED.')
