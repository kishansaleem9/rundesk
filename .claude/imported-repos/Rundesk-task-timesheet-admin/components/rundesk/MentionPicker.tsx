import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import type { User } from "@/lib/rundesk/types";

export default function MentionPicker({ users, currentUserId, onSelect }: { users: User[]; currentUserId: string; onSelect: (name: string) => void }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const matches = useMemo(() => users.filter(user => user.name.toLowerCase().includes(query.toLowerCase())), [query, users]);
  return (
    <section className="popover mention-picker" role="dialog" aria-label="Mention someone">
      <label><Search size={15} /><input autoFocus value={query} onChange={event => {setQuery(event.target.value);setSelected(0)}} onKeyDown={event=>{if(event.key==="ArrowDown"){event.preventDefault();setSelected(index=>Math.min(matches.length-1,index+1))}else if(event.key==="ArrowUp"){event.preventDefault();setSelected(index=>Math.max(0,index-1))}else if(event.key==="Enter"&&matches[selected]){event.preventDefault();onSelect(matches[selected].name)}}} placeholder="Search people" /></label>
      <h3>People</h3>
      <div>{matches.map((user,index) => <button className={index===selected?"selected":""} key={user.id} onMouseEnter={()=>setSelected(index)} onClick={() => onSelect(user.name)}><i>{user.name.split(" ").map(part => part[0]).join("").slice(0, 2)}</i><span>{user.name}{user.id === currentUserId && <small>You</small>}</span></button>)}</div>
    </section>
  );
}
