# THE VIEW'S CSV ASKS THE PICTURE'S PLAN.
# (`resume-defects/resume-5`)
# Reddens: gantt-one-chart: "on Pro, PDF and PNG open the plan’s gate naming Business and download nothing, while the CSV of the same rows stays free"
#
# The CSV is held behind the same gate as PDF and PNG.
import io
p = '/home/user/rundesk/apps/web/src/components/gantt-chart.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('  const exportCsv = useCallback(() => {\n    const rows = visibleGroups.flatMap((g) => g.rows)',
     '  const exportCsv = useCallback(() => {\n    if (!mayExportPicture()) return 0\n    const rows = visibleGroups.flatMap((g) => g.rows)'),
    ('  }, [visibleGroups, exportName])',
     '  }, [visibleGroups, exportName, mayExportPicture])'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("goc-19-the-csv-gated: THE VIEW'S CSV ASKS THE PICTURE'S PLAN.")
