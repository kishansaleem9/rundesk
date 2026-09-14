import { MessageSquareReply, Search, Settings2, UserRoundCheck, UsersRound } from "lucide-react";
import type { User } from "@/lib/rundesk/types";
import Avatar from "./Avatar";

type Tool = "members" | "search" | "replies" | "assigned" | "settings" | null;

export default function RightRail({ users, active, unreadReplies = 0, onMembers, onSearch, onReplies, onAssigned, onSettings }: {
  users: User[];
  active: Tool;
  unreadReplies?: number;
  onMembers: () => void;
  onSearch: () => void;
  onReplies: () => void;
  onAssigned: () => void;
  onSettings: () => void;
}) {
  return <aside className="right-rail" aria-label="Channel tools">
    <div className="right-members">
      {users.slice(0, 3).map(user => <button key={user.id} title={user.name} onClick={onMembers}><Avatar user={user} size={25}/></button>)}
      <button className="member-count" title="All members" onClick={onMembers}>{users.length > 3 ? `+${users.length - 3}` : users.length}</button>
    </div>
    <div className="right-divider" />
    <button className={active === "search" ? "active" : ""} title="Find in channel" onClick={onSearch}><Search size={18} /></button>
    <button className={`badged ${active === "replies" ? "active" : ""}`} title="Replies" onClick={onReplies}><MessageSquareReply size={18} />{unreadReplies > 0 && <i>{Math.min(99, unreadReplies)}</i>}</button>
    <button className={active === "assigned" ? "active" : ""} title="Assigned messages" onClick={onAssigned}><UserRoundCheck size={18} /></button>
    <button className={active === "members" ? "active" : ""} title="Followers and members" onClick={onMembers}><UsersRound size={18} /></button>
    <button className={active === "settings" ? "active" : ""} title="Channel settings" onClick={onSettings}><Settings2 size={18} /></button>
  </aside>;
}
