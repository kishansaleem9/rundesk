/**
 * §V2-08 — "Print", frame `15:32`.
 *
 * `[15:32]` "Aap task ko PRINT bhi kar sakte hain — yeh maine aap ko batayi
 * nahi hai; [chalo] dekh lo ke yahan par aap task ko print kar sakte ho." She
 * goes out of her way to show it, which is why it is here and not filed under
 * "nice to have".
 *
 * WHY A SEPARATE DOCUMENT RATHER THAN A PRINT STYLESHEET OVER THE SHEET.
 * Printing the app's own markup means printing a slide-over panel: a fixed
 * overlay clipped to the viewport, inside a scroll container, next to a
 * sidebar. Getting that onto paper means a growing pile of `@media print`
 * overrides that break every time the layout moves, and the failure mode is a
 * blank second page or a task cut off at the fold — discovered by a person at a
 * printer, not by anyone here. So this renders a plain document into a portal
 * on `body`, and print media shows THAT and hides the app.
 *
 * WHAT GOES ON THE PAPER is the decision worth arguing about, and the rule is:
 * everything a person reading this away from the screen cannot look up.
 * Title, the identifier they will quote, status, priority, dates, who it is
 * for, the description, and the checklists — because a printed task is usually
 * a printed to-do list. Comments and activity are deliberately out: they are a
 * conversation, they can run to hundreds of entries, and nobody prints a task
 * to read its comment history.
 *
 * It is rendered ONLY while printing, not mounted permanently and hidden. A
 * permanently mounted copy of every open task would be read by screen readers
 * and searched by ctrl-F, which is a strange second copy of the page.
 */

import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from '../lib/i18n'

export type PrintableTask = {
  id: string
  title: string
  description?: string | null
  status: string
  priority: string
  startDate?: string | null
  dueDate?: string | null
  createdAt?: string | null
  /*
   * The shape the task detail already has: assignment ROWS, each wrapping the
   * user. Accepting that here rather than a flat list of people means the call
   * site does not have to reshape the task on the way in — a reshape that would
   * be one more thing to keep in step with the API.
   */
  assignees?: Array<{ user?: { id?: string; displayName?: string | null; email?: string | null } | null }> | null
  listName?: string | null
  projectName?: string | null
  checklists?: Array<{
    id: string
    title: string
    items?: Array<{ id: string; content?: string | null; title?: string | null; isComplete?: boolean | null }> | null
  }> | null
}

/** Where the printed copy is mounted, and what the print rules target. */
export const PRINT_ROOT_ID = 'task-print-root'

function Row({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <th
        style={{ textAlign: 'left', verticalAlign: 'top', padding: '2px 12px 2px 0', fontWeight: 600, width: '140px' }}
      >
        {label}
      </th>
      <td style={{ padding: '2px 0', verticalAlign: 'top' }}>{value}</td>
    </tr>
  )
}

export function TaskPrintView({ task, onDone }: { task: PrintableTask; onDone: () => void }) {
  const { t } = useTranslation()

  useEffect(() => {
    document.body.classList.add('printing-task')
    /*
     * The print dialog is modal and blocks this thread, so the frame after it
     * returns is the earliest the app can be put back. `afterprint` is the
     * correct signal and fires on cancel too — a person who backs out of the
     * dialog must not be left with the app hidden behind a print stylesheet.
     */
    const finish = () => {
      document.body.classList.remove('printing-task')
      onDone()
    }
    window.addEventListener('afterprint', finish)
    // A frame first, so the portal is painted before the dialog snapshots it.
    const id = window.requestAnimationFrame(() => window.print())
    return () => {
      window.cancelAnimationFrame(id)
      window.removeEventListener('afterprint', finish)
      document.body.classList.remove('printing-task')
    }
  }, [onDone])

  const people = (task.assignees ?? [])
    .map((a) => a.user?.displayName || a.user?.email)
    .filter(Boolean)
    .join(', ')
  const date = (value?: string | null) => (value ? new Date(value).toLocaleDateString() : '—')
  const where = [task.projectName, task.listName].filter(Boolean).join(' / ')

  return createPortal(
    <article
      id={PRINT_ROOT_ID}
      data-testid="task-print-root"
      style={{ padding: '16mm', color: '#000', background: '#fff', fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}
    >
      <h1 style={{ fontSize: '20pt', margin: '0 0 2mm', lineHeight: 1.2 }}>{task.title}</h1>
      {/*
        The identifier is on the paper on purpose: the commonest reason to
        print a task is to carry it to a conversation, and the first question
        there is "which one".
      */}
      <p style={{ margin: '0 0 6mm', fontSize: '9pt', color: '#555' }} data-testid="task-print-id">
        {task.id}
        {where ? ` · ${where}` : ''}
      </p>

      <table style={{ borderCollapse: 'collapse', fontSize: '10pt', margin: '0 0 6mm' }}>
        <tbody>
          <Row label={t('taskDetail.fieldStatus')} value={task.status} />
          <Row label={t('taskDetail.fieldPriority')} value={task.priority} />
          <Row label={t('taskDetail.fieldStartDate')} value={date(task.startDate)} />
          <Row label={t('taskDetail.fieldDueDate')} value={date(task.dueDate)} />
          <Row label={t('taskDetail.fieldAssignees')} value={people || t('taskDetail.unassigned')} />
        </tbody>
      </table>

      <section data-testid="task-print-description">
        <h2 style={{ fontSize: '11pt', margin: '0 0 2mm' }}>{t('taskDetail.description')}</h2>
        {task.description ? (
          <div style={{ fontSize: '10pt', whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>{task.description}</div>
        ) : (
          <div style={{ fontSize: '10pt', color: '#666', fontStyle: 'italic' }}>{t('taskPrint.noDescription')}</div>
        )}
      </section>

      {(task.checklists ?? []).length > 0 && (
        <section style={{ marginTop: '6mm' }} data-testid="task-print-checklists">
          {(task.checklists ?? []).map((list) => (
            <div key={list.id} style={{ marginBottom: '4mm', breakInside: 'avoid' }}>
              <h2 style={{ fontSize: '11pt', margin: '0 0 1mm' }}>{list.title}</h2>
              <ul style={{ margin: 0, paddingLeft: '5mm', fontSize: '10pt', lineHeight: 1.5 }}>
                {(list.items ?? []).map((item) => (
                  <li key={item.id} style={{ listStyle: 'none' }}>
                    {/* A box, not a tick glyph — the point of a printed checklist is to fill it in. */}
                    <span style={{ fontFamily: 'monospace' }}>{item.isComplete ? '[x]' : '[ ]'}</span>{' '}
                    {item.content || item.title || ''}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      <footer style={{ marginTop: '8mm', borderTop: '1px solid #ccc', paddingTop: '2mm', fontSize: '8pt', color: '#666' }}>
        {t('taskPrint.printedOn', { when: new Date().toLocaleString() })}
      </footer>
    </article>,
    document.body,
  )
}
