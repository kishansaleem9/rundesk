# THE ONE GANTT DRAWS NO TASK-PANEL SWITCH.
# (`resume-defects/resume-5`)
# Reddens: gantt-one-chart: "the list's Gantt tab draws the one Gantt: the time period, the task panel, Today, week numbers, Auto fit, Customize and Export, over a bar for each of the list's five dated tasks"
#
# Its toolbar loses a control, on the list tab as on the timeline.
import io
p = '/home/user/rundesk/apps/web/src/components/gantt-chart.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('        <button\n          type="button"\n          data-testid="timeline-panel-toggle"',
     '        {false && <button\n          type="button"\n          data-testid="timeline-panel-toggle"'),
    ('          <span className="hidden sm:inline">{t(\'timeline.togglePanel\')}</span>\n        </button>\n',
     '          <span className="hidden sm:inline">{t(\'timeline.togglePanel\')}</span>\n        </button>}\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('goc-1-no-panel-toggle: THE ONE GANTT DRAWS NO TASK-PANEL SWITCH.')
