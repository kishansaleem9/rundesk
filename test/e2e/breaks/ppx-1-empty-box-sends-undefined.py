# AN EMPTIED BOX SENDS `undefined` again, which JSON drops: the old prefix stays.
# Reddens: planner-prefix: "clearing it goes back to the default — the server keeps no prefix, and after a reload the box reads \"Work on\""
import io
p = '/home/user/rundesk/apps/web/src/components/planner-settings-dialog.tsx'
a = '                    onBlur={(e) => set({ blockPrefix: e.target.value.trim() || null })}\n'
b = '                    onBlur={(e) => set({ blockPrefix: e.target.value.trim() || undefined })}\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ppx-1-empty-box-sends-undefined: an empty box sends undefined')
