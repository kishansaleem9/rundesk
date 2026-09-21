# The write is accepted and stores nothing: 200, a toast, and an empty field.
# The facade from the writing side. Also reddens the panel and grid readers.
# Reddens: custom-field-types: "a real task in this workspace round-trips as exactly that id"
import io
p = '/home/user/rundesk/apps/api/src/modules/custom-fields/custom-fields.service.ts'
a = "          break\n        }\n        /* 0158 — the strokes, checked against the grammar the column documents. */\n        case 'signature':\n"
b = "          value = []\n          break\n        }\n        /* 0158 — the strokes, checked against the grammar the column documents. */\n        case 'signature':\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('custom-fields.service.ts: a tasks field now stores an empty list whatever it is sent.')
