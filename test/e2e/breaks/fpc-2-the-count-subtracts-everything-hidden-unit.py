# THE COUNT SUBTRACTS EVERYTHING HIDDEN, as the chip did (`found-30-sep/fields-picker-counts-hidden-columns`), for the unit tests of
# `shownFieldCount`.
# Reddens: unit: fields-shown.test.ts "counts a hidden built-in column as no hidden field"
#   "never reads below nought, whatever is hidden"
#   "counts one lower for each of the fields themselves hidden"
import io
p = '/home/user/rundesk/apps/web/src/lib/fields-shown.ts'
a = "  return fields.filter((f) => !hidden.has(f.id)).length\n"
b = "  return fields.length - hidden.size // BROKEN: a hidden column counted as a hidden field\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("fpc-2-the-count-subtracts-everything-hidden-unit: the shown count subtracts every hidden key")
