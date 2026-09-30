# DOWNLOAD ALL SAYS ONLY THAT IT FAILED (`found-30-sep/download-refusals-say-no-reason`): the Attachments
# section's refusal toast is its own fixed words, whatever the server said — past the zip's cap the reader is not
# told how much the files come to, or to download them one at a time.
# Reddens: task-attachments: "a task whose files come to more than a zip holds is refused in the server's own words — how much, what a zip holds, one at a time — and nothing is saved"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = "      toast.error(refusalMessage(err, t('taskDetail.attachmentsDownloadAllFailed')))\n"
b = "      void err\n      toast.error(t('taskDetail.attachmentsDownloadAllFailed'))\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('drr-2-download-all-says-only-that-it-failed: the toast is fixed words')
