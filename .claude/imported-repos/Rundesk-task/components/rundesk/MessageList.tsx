import { LoaderCircle } from "lucide-react";
import type { Channel, Message } from "@/lib/rundesk/types";
import MessageItem from "./MessageItem";

interface Props { channel: Channel; messages: Message[]; currentUserId: string; loading: boolean; error: string; onReply: (message: Message) => void; onReact: (message: Message, emoji: string) => void; onEdit: (message: Message, content: string) => Promise<boolean>; onDelete: (message: Message) => void; onTask: (message: Message) => void; onAssign:(message:Message)=>void; onMarkUnread:(message:Message)=>void; }
function dayKey(value:string){const date=new Date(value);return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`}
function dayLabel(value:string){const date=new Date(value),today=new Date(),yesterday=new Date();yesterday.setDate(today.getDate()-1);if(dayKey(value)===dayKey(today.toISOString()))return "Today";if(dayKey(value)===dayKey(yesterday.toISOString()))return "Yesterday";return date.toLocaleDateString(undefined,{weekday:"short",month:"short",day:"numeric"})}
export default function MessageList({ channel, messages, currentUserId, loading, error, ...actions }: Props) {
  if (loading) return <div className="center-state"><LoaderCircle className="spin" size={22} />Loading messages…</div>;
  if (error) return <div className="center-state error-state">{error}</div>;
  if(!messages.length) return <div className="message-list"><div className="channel-intro compact"><div>#</div><h2>Welcome to #{channel.name}</h2><p>{channel.description || "This is the beginning of this channel."}</p></div></div>;
  const unreadAt=channel.lastReadAt?new Date(channel.lastReadAt).getTime():null;
  const newIndex=unreadAt==null?-1:messages.findIndex(message=>message.authorId!==currentUserId&&new Date(message.createdAt).getTime()>unreadAt);
  return <div className="message-list">{messages.map((message,index)=>{
    const previous=messages[index-1];
    const dateChanged=!previous||dayKey(previous.createdAt)!==dayKey(message.createdAt);
    const showNew=index===newIndex;
    const compact=Boolean(previous&&!dateChanged&&previous.authorId===message.authorId&&new Date(message.createdAt).getTime()-new Date(previous.createdAt).getTime()<300000);
    return <div key={message.id}>{dateChanged&&<div className="date-divider"><span>{dayLabel(message.createdAt)}</span></div>}{showNew&&<div className="new-divider"><span>New</span></div>}<MessageItem message={message} compact={compact} currentUserId={currentUserId} {...actions}/></div>
  })}</div>;
}
