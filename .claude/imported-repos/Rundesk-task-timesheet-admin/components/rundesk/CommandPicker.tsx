"use client";

import { AtSign, FilePlus2, FileUp, ListTodo, Palette, Search, Smile, Video } from "lucide-react";
import { useMemo, useState } from "react";

type Action = "task" | "upload" | "mention" | "emoji" | "task-picker" | "whiteboard" | "clip";
const commands: Array<{label:string;hint:string;action:Action;icon:typeof ListTodo}> = [
  {label:"Create task",hint:"Turn an idea into an actionable task",action:"task",icon:ListTodo},
  {label:"Attach file",hint:"Upload a file to this message",action:"upload",icon:FileUp},
  {label:"Mention person",hint:"Notify a workspace member",action:"mention",icon:AtSign},
  {label:"Insert emoji",hint:"Add an emoji at the cursor",action:"emoji",icon:Smile},
  {label:"Share task",hint:"Reference an existing Rundesk task",action:"task-picker",icon:FilePlus2},
  {label:"Create whiteboard",hint:"Start a Rundesk whiteboard",action:"whiteboard",icon:Palette},
  {label:"Record clip",hint:"Capture your screen",action:"clip",icon:Video},
];

export default function CommandPicker({ onSelect }: { onSelect: (action:Action)=>void }){
  const [query,setQuery]=useState("");
  const items=useMemo(()=>commands.filter(item=>`${item.label} ${item.hint}`.toLowerCase().includes(query.toLowerCase())),[query]);
  return <section className="popover command-picker"><label><Search size={15}/><input autoFocus value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search commands"/></label><small>Commands</small><div>{items.map(item=>{const Icon=item.icon;return <button key={item.action} onClick={()=>onSelect(item.action)}><span><Icon size={16}/></span><div><strong>{item.label}</strong><small>{item.hint}</small></div></button>})}{!items.length&&<p>No commands found.</p>}</div></section>;
}
