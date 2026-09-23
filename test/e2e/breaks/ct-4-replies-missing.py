# A THREAD THAT ALWAYS LOOKS EMPTY. The replies are fetched, counted in the
# header and never drawn, so every thread reads "No replies yet" and the
# composer invites you to write one that already exists.
# Reddens: comment-thread: "with the replies it already has under it"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = "      {replies.length === 0 ? ("
b = "      {true ? ("
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('task-detail-sheet.tsx: the thread draws its empty state whatever it holds.')
