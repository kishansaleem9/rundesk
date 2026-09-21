# The offer panel stops listing what the upgrade would bring.
# Reddens: "and says what else the tier would bring".
import io
p = '/home/user/rundesk/apps/web/src/components/feature-gate.tsx'
s = io.open(p, encoding='utf-8').read()
a = "      .slice(0, 8)"
assert s.count(a) == 1, f'anchor occurs {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, "      .slice(0, 0)"))
print('[break 10] truncated the "what the tier includes" list to nothing in feature-gate.tsx —')
print('           the paywall shows a price with nothing behind it.')
