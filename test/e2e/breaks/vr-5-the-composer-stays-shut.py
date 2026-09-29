# The dock's composer stays disabled whatever /ai/status says, as it read to
# video-regression while the suite looked for it by a placeholder the product no
# longer shows (`found-29-sep/video-regression-finds-the-composer-by-its-old-words`):
# found by its own hook, a composer that will not take a question fails the
# check that it is usable, and the six after it are skipped.
#
# Reddens: video-regression: "the AI composer is usable once the model is available"
import io
p = '/home/user/rundesk/apps/web/src/components/ai-panel.tsx'
a = "            disabled={!aiAvailable || isStreaming}\n            className=\"text-sm\"\n"
b = "            disabled={true}\n            className=\"text-sm\"\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai-panel.tsx: the composer is always disabled.')
