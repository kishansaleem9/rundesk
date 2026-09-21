# The stored strokes are not the strokes that were drawn — a space is prepended on
# the way in. Also reddens the check that appends a stroke to them.
# Reddens: custom-field-types: "and a real pair of strokes round-trips character for character"
import io
p = '/home/user/rundesk/apps/api/src/modules/custom-fields/custom-fields.service.ts'
a = "        /* 0158 — the strokes, checked against the grammar the column documents. */\n        case 'signature':\n          assertSignature(value)\n          break\n"
b = "        /* 0158 — the strokes, checked against the grammar the column documents. */\n        case 'signature':\n          assertSignature(value)\n          value = ` ${value}`\n          break\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('custom-fields.service.ts: the stored signature is rewritten on save.')
