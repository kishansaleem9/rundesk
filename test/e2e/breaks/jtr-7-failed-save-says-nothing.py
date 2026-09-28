# A FAILED SAVE SAYS NOTHING: the error is never set.
# Reddens: job-title-rule: "a job title that fails to save says so on the card and keeps the draft open, and the saved title is unchanged"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-teams-page.tsx'
s = io.open(p, encoding='utf-8').read()
a = '      setTitleError(\n        err instanceof ApiError && err.message\n'
b = '      void setTitleError\n      void (\n        err instanceof ApiError && err.message\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('jtr-7-failed-save-says-nothing: done')
