# A number field keeps its first value: the second write answers 200 and changes
# nothing, so a derived number stops following its inputs while still looking live.
# Reddens: custom-field-types: "changing an input moves it with no write to the formula at all"
import io
p = '/home/user/rundesk/apps/api/src/modules/custom-fields/custom-fields.service.ts'
a = '    if (existing[0]) {\n      const [row] = await this.db\n        .update(customFieldValues)\n        .set({ value: { v: value }, updatedAt: new Date() })\n'
b = "    if (existing[0]) {\n      if (def.type === 'number') return existing[0]\n      const [row] = await this.db\n        .update(customFieldValues)\n        .set({ value: { v: value }, updatedAt: new Date() })\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('custom-fields.service.ts: a number field is now write-once.')
