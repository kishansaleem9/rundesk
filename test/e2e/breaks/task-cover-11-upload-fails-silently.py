# A failed upload says nothing — the state this tab shipped in, which its own
# comment in `cover-image-picker.tsx` describes: "no handler at all, so a failed
# upload and a successful one looked the same: nothing happened either way".
#
# The catch stays (an unhandled rejection is a different defect) and only the
# sentence goes, which is the version that photographs as working: press the
# button, choose a file, watch nothing happen, and no idea whether it worked.
#
# PREDICTED ONE. The cover is genuinely left alone, so the check after it still
# passes — that is the point of having both.
#
# Reddens: task-cover: "choosing a file when storage is unconfigured SAYS so, rather than doing nothing visible"
import io
p = '/home/user/rundesk/apps/web/src/components/cover-image-picker.tsx'
a = "      setUploadError(err instanceof Error ? err.message : t('coverImage.uploadFailed'))\n"
b = "      void err\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor occurs {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('cover-image-picker.tsx: a failed upload reports nothing.')
