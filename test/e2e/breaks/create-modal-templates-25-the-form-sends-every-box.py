# THE FORM SENDS EVERY BOX, SET OR NOT
# (`found-30-sep/template-submit-ignores-the-form`): the start date and the
# estimate go to the route as null when the person left them alone, so the
# request no longer says what was set — the fix that sends the whole form.
#
# Re-aimed 8 October: the dates carry their time flag (`found-6-oct/a-time-on-utc-midnight-reads-as-no-time`).
# Reddens: create-modal-templates: "Create sends the template’s route what was set in the form and nothing left alone — no estimate, start date or task type — and the task holds the template’s estimate and start date for them"
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("      ...dateWriteOf('startDate', startDate),\n",
     "      startDate: startDate ? new Date(startDate).toISOString() : null,\n"),
    ("      ...(estimate ? { timeEstimate: estimate.seconds } : {}),\n",
     "      timeEstimate: estimate ? estimate.seconds : null,\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('create-modal-templates-25-the-form-sends-every-box: the start date and estimate are sent as null when left alone')
