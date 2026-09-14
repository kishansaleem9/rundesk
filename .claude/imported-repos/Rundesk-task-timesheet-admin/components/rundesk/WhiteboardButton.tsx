import { PanelsTopLeft } from "lucide-react";

export default function WhiteboardButton({ onClick }: { onClick: () => void }) {
  return <button type="button" className="toolbar-button" onClick={onClick} title="New Whiteboard"><PanelsTopLeft size={18} /></button>;
}
