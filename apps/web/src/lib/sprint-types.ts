export type SprintStatus = 'planned' | 'active' | 'completed' | 'cancelled'

export type SprintSummary = {
  id: string
  name: string
  goal?: string | null
  startDate: string
  endDate: string
  status: SprintStatus
  taskCount: number
  completedTasks: number
  totalPoints: number
  completedPoints: number
}

export type SprintDetail = SprintSummary & {
  burndown: Array<{ day: string; ideal: number; actual: number | null }>
  tasks: SprintTaskRow[]
}

export type SprintTaskRow = {
  id: string
  title: string
  status: string
  statusCategory: 'open' | 'in_progress' | 'closed'
  priority?: string | null
  dueDate?: string | null
  storyPoints?: number | null
  completedAt?: string | null
}

export type SprintVelocityRow = {
  sprintId: string
  name: string
  startDate: string
  endDate: string
  status: SprintStatus
  taskCount: number
  plannedPoints: number
  completedPoints: number
}

export function isSprintTaskDone(task: Pick<SprintTaskRow, 'status' | 'statusCategory'>) {
  return task.statusCategory === 'closed' || task.status === 'done'
}

export function sprintDayProgress(startDate: string, endDate: string) {
  const start = new Date(startDate)
  const end = new Date(endDate)
  const now = new Date()
  const totalMs = Math.max(1, end.getTime() - start.getTime())
  const elapsed = Math.min(totalMs, Math.max(0, now.getTime() - start.getTime()))
  const totalDays = Math.max(1, Math.ceil(totalMs / (24 * 60 * 60 * 1000)))
  // floor (not ceil): during the sprint's first calendar day `elapsed` is a tiny
  // positive value, and ceil(…)+1 wrongly reported "Day 2" from the moment a
  // same-day sprint was created. floor(elapsed/day)+1 gives Day 1 on day one.
  const currentDay = Math.min(totalDays, Math.max(1, Math.floor(elapsed / (24 * 60 * 60 * 1000)) + 1))
  return { currentDay, totalDays }
}
