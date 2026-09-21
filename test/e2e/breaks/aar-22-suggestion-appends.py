# A mid-word suggestion APPENDS instead of replacing the stem: "create a fol" plus
# "folder" becomes "create a fol folder". Invisible in a screenshot of the bar,
# obvious the first time anybody presses one.
# Reddens: ai-answer-rendering: "pressing it REPLACES the stem rather than appending after it"
import io
p = '/home/user/rundesk/apps/web/src/components/ai-panel.tsx'
a = """  if (/\\s$/.test(text) || text === '') return `${text}${word} `
  const cut = text.replace(/\\S+$/, '')
  return `${cut}${word} `"""
b = """  return `${text}${word} `"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai-panel.tsx: a word suggestion is appended after the half-typed stem.')
