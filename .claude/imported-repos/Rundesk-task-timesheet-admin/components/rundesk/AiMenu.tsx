import { ArrowRight, ListTodo, MessageSquareText, Sparkles, X } from "lucide-react";

export default function AiMenu({ onClose }: { onClose: () => void }) {
  return (
    <section className="popover ai-menu" role="dialog" aria-label="Rundesk AI">
      <header><span># D&amp;D TEAM</span><button onClick={onClose} aria-label="Close"><X size={16} /></button></header>
      <div className="ai-orb"><Sparkles size={22} /></div>
      <h2>How can I help you today?</h2>
      <p>I can answer questions, search, and write anything.</p>
      <button className="ai-input">Ask anything about this channel <ArrowRight size={16} /></button>
      <h3>For this Channel</h3>
      <button><MessageSquareText size={17} /><span>Summarize channel</span><ArrowRight size={14} /></button>
      <button><ListTodo size={17} /><span>Create a task</span><ArrowRight size={14} /></button>
      <button><Sparkles size={17} /><span>Write</span><ArrowRight size={14} /></button>
    </section>
  );
}
