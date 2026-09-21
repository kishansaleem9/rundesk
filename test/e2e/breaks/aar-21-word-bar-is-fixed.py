# Three words that never change. The bar is on screen, it has three chips in it, it is
# positioned exactly as `17:42` positions it — and it would have photographed
# identically at all three timecodes, which is the whole reason the row exists.
# Reddens: ai-answer-rendering: "after 'create a ' it offers the frame's own three: new · list · list of"
#          ai-answer-rendering: "a half-typed word is COMPLETED from what the product can be asked to do"
import io
p = '/home/user/rundesk/apps/web/src/components/ai-panel.tsx'
a = """  const endsMidWord = !/\\s$/.test(text)"""
b = """  return [...GENERIC_NEXT]
  const endsMidWord = !/\\s$/.test(text)"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai-panel.tsx: the word bar now offers the same three words for any text.')
