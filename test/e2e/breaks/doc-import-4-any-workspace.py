# The workspace guard is removed, so the import writes anywhere.
#
# THE ONE NO CONTENT CHECK COULD EVER SEE. A write that lands in the WRONG
# workspace SUCCEEDS: there is no error, no failing check and no log line. This
# endpoint shipped in exactly this state, carrying only JwtAuthGuard and the
# DOCS feature flag — which prove who you are and that Docs are enabled, not
# that you belong to the workspace named in the path. It was green in
# twenty-nine unit cases while writing into somebody else's workspace, because
# all twenty-nine were about the payload.
#
# Reddens: doc-import: "and a workspace you do not belong to refuses the write rather than accepting it quietly"
import io
p = '/home/user/rundesk/apps/api/src/modules/docs/docs.controller.ts'
a = """  @UseGuards(WorkspaceMemberGuard)
  importDoc("""
b = """  importDoc("""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor occurs {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('docs.controller.ts: the import accepts any workspace id.')
