import { BarChart3, ChevronDown, ChevronLeft, ChevronRight, Clapperboard, Clock3, FileStack, Home, LayoutTemplate, MessageCircle, Network, Settings, TimerReset } from "lucide-react";

const navigation = [[Home,"Home"],[TimerReset,"Sprints"],[BarChart3,"Reports"],[Clock3,"Time"],[LayoutTemplate,"Templates"],[Network,"Integrations"],[FileStack,"Mind maps"],[Clapperboard,"Clips"],[MessageCircle,"Chat"]] as const;

export default function WorkspaceRail({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return <aside className={`workspace-rail ${collapsed ? "collapsed" : ""}`} aria-label="Rundesk navigation">
    <div className="workspace-switcher-row">
      <button className="workspace-switcher" title={collapsed ? "AURA" : undefined}>
        <span>A</span>
        <div><strong>AURA</strong><small>Enterprise · 3 members</small></div>
        <ChevronDown size={15}/>
      </button>
      <button className="workspace-collapse" onClick={onToggle} aria-label={collapsed ? "Expand Rundesk navigation" : "Collapse Rundesk navigation"} title={collapsed ? "Expand sidebar" : "Collapse sidebar"}>{collapsed ? <ChevronRight size={15}/> : <ChevronLeft size={15}/>}</button>
    </div>
    <nav className="workspace-nav">{navigation.map(([Icon,label]) => <button key={label} title={collapsed ? label : undefined} className={`workspace-item ${label === "Chat" ? "active" : ""}`}><Icon size={18}/><span>{label}</span></button>)}</nav>
    <button className="workspace-settings" title={collapsed ? "Settings" : undefined}><Settings size={17}/><span>Settings</span></button>
  </aside>;
}
