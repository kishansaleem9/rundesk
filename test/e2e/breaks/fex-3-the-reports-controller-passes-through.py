# THE REPORTS CONTROLLER PASSES EVERYTHING THROUGH: the export "fixed" by exempting
# the controller that has the exports, rather than the handlers that send a file,
# so a report run for the screen loses its envelope as well.
#
# RE-AIMED. Its first form (`fex-3-nothing-wrapped`) unwrapped every answer, the
# sign-in's too, so the suite could not sign in and ran 1 check of 8: a crash,
# not the twin reddening.
# Reddens: file-exports: "while the same report run for the screen still arrives in the envelope: { data: { rows }, error: null }"
import io
p = '/home/user/rundesk/apps/api/src/common/interceptors/response.interceptor.ts'
a = '        if (isRawBody(handler, data)) return data\n'
b = "        if (isRawBody(handler, data) || context.getClass().name === 'ReportsController') return data\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("fex-3-the-reports-controller-passes-through: applied")
