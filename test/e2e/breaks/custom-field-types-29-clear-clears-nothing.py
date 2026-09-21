# Clear is wired to nothing. It is the dead control, in its purest form.
# Reddens: custom-field-types: "and Clear really clears it on the server, not only on screen"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = '          onClick={() => onCommit(null)}\n          className="rounded border border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50"\n'
b = '          onClick={() => {}}\n          className="rounded border border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50"\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('task-detail-sheet.tsx: Clear no longer clears the signature.')
