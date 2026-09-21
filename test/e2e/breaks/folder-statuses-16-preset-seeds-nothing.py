# Make a preset seed no space statuses at all — the insert of an empty array
# throws inside applyPreset's try, which logs a warning and carries on. This is
# the exact shape that made this suite's first run fail: the space looked
# created, and had nothing to inherit.
# Reddens: folder-dialog: "this run's space has statuses of its own to inherit"
import io
p = '/home/user/rundesk/apps/api/src/modules/spaces/spaces.service.ts'
a = "        preset.statuses.map((st, i) => ({"
b = "        preset.statuses.slice(0, 0).map((st, i) => ({"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('spaces.service.ts: a preset seeds no space statuses — the warn is swallowed and the space looks fine.')
