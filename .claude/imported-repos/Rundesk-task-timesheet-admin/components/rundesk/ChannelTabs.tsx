import { Plus } from "lucide-react";

export default function ChannelTabs() {
  return (
    <div className="channel-tabs">
      <button className="active">Channel</button>
      <button><Plus size={14} />View</button>
    </div>
  );
}
