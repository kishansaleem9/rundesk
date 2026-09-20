# Check 17 — THE ANTI-FACADE CHECK for the Custom swatch.
#
# Commit a constant instead of the colour the person chose. The cell is still
# there, it still opens, the chooser still works, the dialog still closes and
# the task still gets a cover — it is simply always the same cover. Every
# "the cover changed" assertion ever written passes on this; only reading the
# colour back and comparing it to the one that was picked does not.
import io
p = '/home/user/rundesk/apps/web/src/components/cover-image-picker.tsx'
s = io.open(p, encoding='utf-8').read()
a = "                    onClick={() => commit({ kind: 'color', value: customColor })}\n"
assert s.count(a) == 1, s.count(a)
io.open(p, 'w', encoding='utf-8').write(
    # BROKEN: the chooser is decoration; one colour is all it can ever send
    s.replace(a, "                    onClick={() => commit({ kind: 'color', value: '#7c5cff' })}\n")
)
print('BROKE check 17: Custom commits a hardcoded colour, whatever you picked')
