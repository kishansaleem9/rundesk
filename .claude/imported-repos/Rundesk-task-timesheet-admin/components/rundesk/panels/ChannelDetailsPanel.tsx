"use client";

import { Bell, BellOff, Calendar, LockKeyhole, Pencil, Search, ShieldCheck, Sparkles, UserPlus, Users, X } from "lucide-react";
import type { Channel, User } from "@/lib/rundesk/types";
import Avatar from "../Avatar";

export default function ChannelDetailsPanel({ channel, users, muted, onClose, onEdit, onMembers, onToggleMute }: { channel:Channel; users:User[]; muted:boolean; onClose:()=>void; onEdit:()=>void; onMembers:()=>void; onToggleMute:()=>void }) {
  return <aside className="detail-panel channel-details clickup-like-settings"><header><div><h2>Channel settings</h2><span>Details, followers and access</span></div><button onClick={onClose}><X size={18}/></button></header><div className="settings-scroll">
    <section className="channel-settings-hero"><span className="settings-hash">#</span><h3>{channel.name}</h3><small>{channel.isPrivate?"Private channel":"Workspace channel"}</small><div className="settings-hero-actions"><button onClick={onMembers}><Users size={17}/><span>Followers</span></button><button type="button" title="AI needs a configured provider"><Sparkles size={17}/><span>AI</span></button><button onClick={onToggleMute}>{muted?<Bell size={17}/>:<BellOff size={17}/>}<span>{muted?"Unmute":"Mute"}</span></button><button onClick={onEdit}><Pencil size={17}/><span>Edit</span></button></div></section>
    <section className="settings-card"><header><strong>Topic</strong><button onClick={onEdit}>Edit</button></header><p>{channel.topic||"Add a topic for this channel"}</p></section>
    <section className="settings-card"><header><strong>Description</strong><button onClick={onEdit}>Edit</button></header><p>{channel.description||"Add a description so teammates know what belongs here."}</p></section>
    <section className="settings-card followers-card"><header><strong>Followers ({channel._count?.members ?? users.length})</strong><button onClick={onMembers}>Manage</button></header><div className="settings-avatar-row">{users.slice(0,8).map(user=><Avatar key={user.id} user={user} size={30}/>)}{users.length>8&&<span className="settings-more">+{users.length-8}</span>}</div><button className="view-all-followers" onClick={onMembers}>View all <span>›</span></button></section>
    <section className="settings-info-grid"><div><LockKeyhole size={16}/><span><strong>Privacy</strong><small>{channel.isPrivate?"Only invited members":"Visible to workspace"}</small></span></div><div><Calendar size={16}/><span><strong>Created</strong><small>{new Date(channel.createdAt).toLocaleDateString()}</small></span></div><div><ShieldCheck size={16}/><span><strong>Access</strong><small>Membership enforced server-side</small></span></div><div><Search size={16}/><span><strong>Search</strong><small>Messages are searchable</small></span></div></section>
    <button className="settings-primary" onClick={onMembers}><UserPlus size={16}/>Sharing &amp; Permissions</button>
  </div></aside>;
}
