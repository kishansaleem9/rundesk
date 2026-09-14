import { AtSign, Bot, ChevronDown, Clapperboard, ListPlus, Paperclip, Plus, Smile, UserPlus } from "lucide-react";
import type { ComposerPopup } from "@/lib/rundesk/types";
import WhiteboardButton from "./WhiteboardButton";

interface Props {
  open: ComposerPopup;
  toggle: (popup: Exclude<ComposerPopup, null>) => void;
  onFormatting: () => void;
}

export default function ComposerToolbar({ open, toggle, onFormatting }: Props) {
  const active = (name: ComposerPopup) => open === name ? " active" : "";
  return (
    <div className="composer-toolbar">
      <button type="button" className={`toolbar-button add${active("plus")}`} onClick={() => toggle("plus")} title="Add content"><Plus size={18} /></button>
      <button type="button" className="message-type" onClick={onFormatting}>Message<ChevronDown size={13} /></button>
      <span className="toolbar-separator" />
      <button type="button" className={`toolbar-button ai${active("ai")}`} onClick={() => toggle("ai")} title="Ask AI"><Bot size={18} /></button>
      <button type="button" className={`toolbar-button${active("attachment")}`} onClick={() => toggle("attachment")} title="Attach"><Paperclip size={18} /></button>
      <button type="button" className={`toolbar-button${active("mention")}`} onClick={() => toggle("mention")} title="Mention"><AtSign size={18} /></button>
      <button type="button" className="toolbar-button" onClick={() => toggle("mention")} title="Assign person"><UserPlus size={18} /></button>
      <button type="button" className={`toolbar-button${active("emoji")}`} onClick={() => toggle("emoji")} title="Emoji"><Smile size={18} /></button>
      <button type="button" className={`toolbar-button${active("clip")}`} onClick={() => toggle("clip")} title="Record Clip"><Clapperboard size={18} /></button>
      <button type="button" className={`toolbar-button${active("create-task")}`} onClick={() => toggle("create-task")} title="Create Task"><ListPlus size={18} /></button>
      <WhiteboardButton onClick={() => toggle("whiteboard")} />
    </div>
  );
}
