# File a feature request as a problem report. Both footer links still work, both still
# open a real ticket, and the one field that routes it to a human is now the same for
# both — which nothing but a check on the request itself would notice.
#
# Reddens: planner-settings: "and \"Feature requests\" files a DIFFERENT one — a wish is not an outage"
import io
p = '/home/user/rundesk/apps/web/src/components/planner-settings-dialog.tsx'
s = io.open(p, encoding='utf-8').read()
a = "          subject: isProblem\n            ? t('plannerSettings.reportSubject')\n            : t('plannerSettings.featureSubject'),"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times, expected exactly 1'
b = "          subject: t('plannerSettings.reportSubject'), // BREAK: both links file the same kind"
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('made Feature requests file a problem-report ticket')
