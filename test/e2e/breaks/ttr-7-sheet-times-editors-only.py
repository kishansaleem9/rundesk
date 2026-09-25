# THE SHEET OFFERS START TIMER TO EDITORS ONLY: a reader's Time tab is a disabled button.
# Reddens: time-tracking-readers: "the sheet offers the guest Start timer on a task shared with them at View, and the timer runs"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("function TimePanel({ taskId, estimate, defaultBillable = false }: { taskId: string; estimate?: number | null; defaultBillable?: boolean }) {\n  const { t } = useTranslation()\n",
     "function TimePanel({ taskId, estimate, defaultBillable = false }: { taskId: string; estimate?: number | null; defaultBillable?: boolean }) {\n  const { t } = useTranslation()\n  const capsForTime = useTaskCaps()\n"),
    ('<Button size="sm" onClick={() => start.mutate()} disabled={start.isPending}>',
     '<Button size="sm" onClick={() => start.mutate()} disabled={start.isPending || !capsForTime.edit}>'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('ttr-7-sheet-times-editors-only: Start timer is for editors')
