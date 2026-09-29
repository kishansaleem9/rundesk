# BRAIN² IS IN THE HEADER AND WORKS, BUT IT READS "ASK AI": the frame's word is gone.
#
# Frame `03:40` reads "Created 7 Aug · Brain² · Share · ⋯". A button that opens
# the right thing under another name is a different control from the one the
# frame draws, and it is the one a reader following the video looks for by
# name. Everything behind the label still works, so the header check is the
# one that fails.
#
# Reddens: brain-entry-points: "the task header offers Brain², straight after its Created chip, as frame `03:40` draws it"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = """                      <BrainIcon className="h-3.5 w-3.5" aria-hidden />
                      {t('taskDetail.brain')}
"""
b = """                      <BrainIcon className="h-3.5 w-3.5" aria-hidden />
                      {t('topbar.askAi')}
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('task-detail-sheet.tsx: the header button reads "Ask AI", not "Brain²".')
