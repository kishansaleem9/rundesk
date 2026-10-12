# Check 17 — the download's name.
# The file arrives with a generic name instead of the one the product promises,
# which is what someone ends up with twelve of in their Downloads folder.
#
# Reddens: gantt-controls: "the download arrives as ${first.name}"
#
# Re-aimed 12 October: the chart is one component now (`components/gantt-chart.tsx`),
# the timeline page's and the list's Gantt tab's (`resume-defects/resume-5`); the line
# moved there with it. Same break.
import io, os
p = os.environ.get('GANTT_SRC', '/home/user/rundesk/apps/web/src/components/gantt-chart.tsx')
s = io.open(p, encoding='utf-8').read()
a = "    anchor.download = filename"
assert s.count(a) == 1, s.count(a)
io.open(p, 'w', encoding='utf-8').write(s.replace(a, "    anchor.download = 'download.csv'"))
print("BROKE 17: the download is named download.csv rather than rundesk-timeline-<date>.csv")
