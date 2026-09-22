# The depth cap goes, so a group inside a group is stored.
#
# The comment on the line that goes says exactly what that costs: "Depth is
# capped at one: a group inside a group has no control in the panel that builds
# it, so it could only arrive from a hand-written request and would render as
# nothing."
#
# So this is the facade seen from the other end. The rules are opaque JSON by
# design — the file's header explains that bargain — and the ONE thing the
# server promises about them is that the reader can render what it is handed.
# A two-level nest is accepted, stored, listed, and then drawn as an empty
# group: a saved filter that matches everything and says nothing, which the
# person will read as the filter being broken rather than as the panel being
# unable to speak about it.
#
# It is also the check most likely to be loosened on purpose. "Why can't I nest
# filters?" is a reasonable question, and the answer is a UI one; deleting the
# guard answers it in the wrong layer.
#
# ONE CHECK. The array check above it and the blank-name check below it are
# separate guards on separate lines, and the round trip of a ONE-level nest —
# which is the shape the panel does build — is untouched.
#
# Reddens: list-filters: "and a bracket inside a bracket is refused — the panel has no control for it"
import io
p = '/home/user/rundesk/apps/api/src/modules/views/list-filters.service.ts'
a = """        if ((leaf as { rules?: unknown }).rules !== undefined) {
          throw new BadRequestException('Filters can nest one level deep')
        }
"""
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('list-filters.service.ts: a group inside a group is now accepted.')
