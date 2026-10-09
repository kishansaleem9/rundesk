# AN EMAIL'S BLIND COPIES ARE READ BY EVERYONE ON THE TASK.
# (`resume-defects/s4-composer-email`, `ledger-rows/row-1252`)
# Reddens: comment-email: "its blind copies are its writer’s to read: a member reading the task is told whom it went to and copied to, not whom it was blind-copied to"
#
# Whom the writer blind-copied is shown to every reader, as no mail client shows it.
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('              bcc: viewerId && viewerId === r.authorId ? e.bccAddresses : [],\n',
     '              bcc: e.bccAddresses, // BROKEN: blind copies for every reader\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("cem-6-blind-copies-shown-to-everyone: AN EMAIL'S BLIND COPIES ARE READ BY EVERYONE ON THE TASK.")
