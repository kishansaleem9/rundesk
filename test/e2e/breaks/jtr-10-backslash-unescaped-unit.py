# A BACKSLASH IN A SEARCH IS NOT ESCAPED, so it escapes the character after it.
# Reddens: unit: like.test.ts "escapes the two wildcards and the escape itself, and wraps the text"
import io
p = '/home/user/rundesk/apps/api/src/common/sql/like.ts'
s = io.open(p, encoding='utf-8').read()
a = r"  return `%${text.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`" + "\n"
b = r"  return `%${text.replace(/[%_]/g, (ch) => `\\${ch}`)}%`" + "\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('jtr-10-backslash-unescaped-unit: done')
