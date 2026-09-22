# The collapsed grid stops saying how many fields it is hiding.
#
# Failure mode 2, and the toggle's own comment is the argument: "SAYING THE
# COUNT IS NOT DECORATION. Collapsed, an empty field and a field that does not
# exist look identical, and somebody who forgot they turned this on files a bug
# about a missing field. The count is the difference between hidden and gone."
#
# Everything else works. The fields go, the fields with values stay, the
# preference survives a reload, both surfaces agree. The only thing lost is the
# sentence that makes a collapsed grid legible — and it is the easiest thing in
# the file to lose, because it is a conditional span with a pluralised string
# inside a flex row, which reads as chrome.
#
# ONE CHECK, and it is the one that carries its arithmetic. The suite asserts
# the count rather than that a notice exists, so this patch cannot be answered
# by putting any number there.
#
# Reddens: collapse-empty-fields: "hiding without saying how much is how a collapsed field becomes a bug report"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = """      {collapse && emptyCount > 0 && (
        <span className="text-[11px] text-muted-foreground" data-testid="empty-fields-hidden">
          {tCount('taskDetail.emptyFieldsHidden', emptyCount)}
        </span>
      )}
"""
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('task-detail-sheet.tsx: the collapsed grid no longer says how much it hid.')
