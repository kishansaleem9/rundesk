# The staged files are listed with nothing saying what the list is.
# Reddens: attach-on-create: "under an Attachments heading, as the frame draws it"
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = '          <div className="text-[11px] font-medium text-muted-foreground">\n            {t(\'quickCreate.attachmentsHeading\')}\n          </div>\n'
b = '          <div className="text-[11px] font-medium text-muted-foreground" />\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('quick-create-modal.tsx: The staged files are listed with nothing saying what the list is.')
