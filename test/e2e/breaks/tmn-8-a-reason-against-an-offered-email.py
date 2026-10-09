# EMAIL IS OFFERED WITH A REASON AGAINST IT.
# Re-aimed 9 October (`resume-defects/s4-composer-email`): this was
# tmn-8-no-reason, which took the reason off the disabled Email row. Email
# sends now; the row's reason is for when it cannot, and drawn beside an
# Email that can it tells the reader not to use what works — in the words
# of Email being off, as an empty line is drawn as nothing at all.
# Reddens: task-mentions: "Comment carries the tick, and Email — on in this workspace — is offered, with no reason against it"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = """                  {!emailAvailable && (
                    <span
                      data-testid="comment-mode-reason-email"
                      className="pl-6 text-[10px] leading-snug text-muted-foreground"
                    >
                      {emailUnavailableReason(t, emailSetup.data, emailSetup.isError)}"""
b = """                  {(emailAvailable || !emailAvailable) && (
                    <span
                      data-testid="comment-mode-reason-email"
                      className="pl-6 text-[10px] leading-snug text-muted-foreground"
                    >
                      {emailUnavailableReason(t, emailSetup.data, emailSetup.isError) || t('taskDetail.emailReasonOff')}"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("task-detail-sheet.tsx: Email is offered with a reason against it.")
