# The created-date chip writes the date day first, whatever the reader's format.
#
# The comment above the chip says why it calls `formatDate` and not the frame's
# literal "7 Aug": "so the chip follows the reader's own date format — the same
# one the due-date badge above it uses". A locale written into the call is the
# shape that loses it: the frame was recorded day first, and
# `toLocaleDateString('en-GB')` reads like the plain way to say so. The admin
# the suite signs in as keeps the system's format, month first in the lanes'
# browser, so the chip says 07/08/2026 for 7 August where the due badge beside
# it would say 8/7/2026 — and a reader cannot tell 7 August from 8 July.
#
# THE CHECK THAT READ NUMBERS PASSED THIS. It pulled 7, 8 and 2026 out of the
# chip, dropped the year, and found the seeded day among the rest and today's
# day not, so it passed this chip on every day but the 8th of a month. It
# compares the label now (`found-8-oct/activity-rail-reads-the-month-as-today`),
# and this reddens it every day.
#
# Reddens: activity-rail: "and it shows when the task was really created, not today"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = "                      {t('taskDetail.createdOn', { date: formatDate(detailQuery.data.createdAt) })}"
b = "                      {t('taskDetail.createdOn', { date: new Date(detailQuery.data.createdAt).toLocaleDateString('en-GB') })}"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('task-detail-sheet.tsx: the created chip now writes the date day first for every reader.')
