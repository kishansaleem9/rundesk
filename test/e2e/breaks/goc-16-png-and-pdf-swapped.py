# EXPORT WRITES A PDF FOR PNG AND A PNG FOR PDF.
# (`resume-defects/resume-5`)
# Reddens: gantt-one-chart:
#   "Export › PNG downloads the picture of the view: a PNG wider than the task names, as tall as its group and five tasks"
#   "and Export › PDF a one-page PDF holding that picture as a JPEG"
#
# The two pictures are swapped.
import io
p = '/home/user/rundesk/apps/web/src/components/gantt-chart.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("        const blob = kind === 'png' ? await pngFromCanvas(canvas) : pdfFromCanvas(canvas)",
     "        const blob = kind === 'pdf' ? await pngFromCanvas(canvas) : pdfFromCanvas(canvas)"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('goc-16-png-and-pdf-swapped: EXPORT WRITES A PDF FOR PNG AND A PNG FOR PDF.')
