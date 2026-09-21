# The paperclip label is hidden, leaving the `display:none` file input behind
# nothing pressable: a picker that exists in the DOM, accepts `setInputFiles`
# from a test, and cannot be opened by a person. The dead control, inverted.
# Reddens: attach-on-create: "the file input accepts several files at once, behind a paperclip a person can press"
import io

p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = '          className="inline-flex cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground"\n          title={t(\'quickCreate.attachFile\')}'
b = '          className="hidden"\n          title={t(\'quickCreate.attachFile\')}'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('quick-create-modal.tsx: the paperclip a person presses is gone; only the hidden input is left.')
