import { FileText, Search, Users } from "lucide-react";
import { useMemo, useState } from "react";
import type { Task } from "@/lib/rundesk/types";

export default function TaskPicker({ tasks, onSelect }: { tasks: Task[]; onSelect: (name: string) => void }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => tasks.filter(task => task.title.toLowerCase().includes(query.toLowerCase())), [query, tasks]);
  return (
    <section className="popover task-picker" role="dialog" aria-label="Browse workspace items">
      <label><Search size={16} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search tasks, docs, or people..." autoFocus /></label>
      <div className="picker-tabs">{["All", "Tasks", "Docs", "People", "Teams"].map(tab => <button className={tab === "All" ? "active" : ""} key={tab}>{tab}</button>)}</div>
      <h3>Recent Tasks</h3>
      <div className="task-results">
        {filtered.map(task => <button key={task.id} onClick={() => onSelect(task.title)}><i className={`status-${task.status.toLowerCase()}`} /><span><strong>{task.title}</strong><small>{task.assignees.map(item => item.user.name).join(", ") || "Unassigned"} · {task.status.replace("_", " ")}</small></span>{task.status === "COMPLETE" ? <FileText size={14} /> : <Users size={14} />}</button>)}
      </div>
    </section>
  );
}
