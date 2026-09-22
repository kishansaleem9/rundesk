# Check 17 — the download's name.
# The file arrives with a generic name instead of the one the product promises,
# which is what someone ends up with twelve of in their Downloads folder.
#
# Reddens: gantt-controls: "the download arrives as"
import io, os
p = os.environ.get('GANTT_SRC', '/home/user/rundesk/apps/web/src/pages/workspace-timeline-page.tsx')
s = io.open(p, encoding='utf-8').read()
a = "    anchor.download = filename"
assert s.count(a) == 1, s.count(a)
io.open(p, 'w', encoding='utf-8').write(s.replace(a, "    anchor.download = 'download.csv'"))
print("BROKE 17: the download is named download.csv rather than rundesk-timeline-<date>.csv")
