# The provider with no key offered as if it worked.
#
# RE-AIMED 14 October: ChatGPT is a pickable tier where its key is set, and the
# row drawn unavailable is Gemini's, which has none on the lanes or in CI
# (`commit-log/log-39863ff-1`).
#
# Reddens: ai-model-picker: "pressing it reveals ChatGPT, pickable, and Gemini, which is not"
import io
p = '/home/user/rundesk/apps/web/src/components/ai-panel.tsx'
a = '                          data-available="false"'
b = '                          data-available="true"'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai-panel.tsx: Gemini, with no key, is presented as an available model.')
