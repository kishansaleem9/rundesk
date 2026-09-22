# Check 27 — THE HEADER SIMPLY NOT STICKING.
# The pane is still a real scrollport, so check 26 passes exactly as before;
# the header just scrolls away with the rows. This is the half of the fix that
# a "does the pane scroll" assertion on its own would never notice.
#
# Reddens: gantt-controls: "and the date header held the top of the pane while the bars moved"
import io, os
p = os.environ.get('GANTT_SRC', '/home/user/rundesk/apps/web/src/pages/workspace-timeline-page.tsx')
s = io.open(p, encoding='utf-8').read()
a = """                    data-testid="timeline-chart-header"
                    className="sticky top-0 z-20 border-b border-border/60 bg-card/95 backdrop-blur-sm\""""
assert s.count(a) == 1, s.count(a)
io.open(p, 'w', encoding='utf-8').write(s.replace(
    a,
    """                    data-testid="timeline-chart-header"
                    className="relative z-20 border-b border-border/60 bg-card/95 backdrop-blur-sm\"""",
))
print('BROKE 27: the date header is no longer sticky and scrolls away with the bars')
