# Any number of files is taken.
# Reddens: brain-comments-and-decks: "Brain takes at most five files at once, and says so"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/composer-files.ts'
a = '  if (files.length > COMPOSER_FILE_LIMITS.files) throw refuse(`Brain takes at most ${COMPOSER_FILE_LIMITS.files} files at once`)\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('bcd-14-files-unlimited: Any number of files is taken.')
