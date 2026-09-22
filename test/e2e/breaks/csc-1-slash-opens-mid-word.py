# The slash opens the block menu anywhere in a line, not only at the start of
# one or after a space.
#
# The condition that goes has its reason written above it: "A slash only starts
# a command at the start of a line or after a space — otherwise 'and/or' or a
# URL would open the menu, which is the behaviour that makes people stop typing
# slashes."
#
# And that is the cost: not a broken feature but a composer people learn to
# avoid. Every URL pasted into a comment pops a menu of ten blocks over the
# box; so does every "and/or", every "he/she", every date written with slashes.
# Nothing errors and nothing is lost — the menu just has to be dismissed, every
# time, by everybody.
#
# It is three clauses in a boolean nobody reads twice, and the one that goes is
# the one that looks like a special case. The clause after it
# (`!/\s/.test(...)`) already stops a slash followed by a space, so the guard
# reads as belt-and-braces until you try typing a URL.
#
# REDDENS THE TWO CHECKS THAT TYPE A SLASH INSIDE SOMETHING. `and/or` opens the
# menu and so does the URL. The menu still opens on a real `/`, still narrows,
# still inserts — so the five checks about the feature working stay green, and
# the failure is about where it fires rather than whether it does.
#
# Reddens: comment-slash-commands: "typing \"and/or\" leaves the menu closed"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = """              slash !== -1 &&
              (slash === 0 || /[\\s]/.test(before[slash - 1])) &&
              !/\\s/.test(before.slice(slash + 1))
"""
b = """              slash !== -1 &&
              !/\\s/.test(before.slice(slash + 1))
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('task-detail-sheet.tsx: a slash mid-word now opens the comment block menu.')
