# TWO PEOPLE LINKING ONE CLIP AT ONCE: THE SECOND IS TOLD IT FAILED (`resume-defects/resume-7`).
#
# The insert that meets the row somebody else just made is retried instead of
# answered with that row, and every retry meets it again: five tries and a
# 400, where the link was sitting there.
#
# Reddens: unit: clips.service.test.ts "answers with the row already there when its insert meets another"
import io
p = '/home/user/rundesk/apps/api/src/modules/clips/clips.service.ts'
a = "      if (raced) return this.linkView(raced.token, audience)\n"
b = "      void raced\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('csl-19-a-racing-insert-is-an-error-unit: a racing insert ends in an error')
