import { Box, Cloud, FilePlus2, HardDriveUpload, Upload } from "lucide-react";
import { useRef } from "react";

export default function AttachmentMenu({ onFile }: { onFile: (file: File) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const items = [
    [Upload, "Upload file"], [Cloud, "Dropbox"], [Cloud, "OneDrive/SharePoint"],
    [Box, "Box"], [HardDriveUpload, "Google Drive"], [FilePlus2, "New Google Doc"],
  ] as const;
  return (
    <section className="popover attachment-menu" role="menu">
      <input ref={input} type="file" hidden accept="image/*,.pdf,.txt,.csv,.zip,.doc,.docx,.xls,.xlsx,.ppt,.pptx" onChange={event => event.target.files?.[0] && onFile(event.target.files[0])} />
      {items.map(([Icon, label], index) => <button key={label} onClick={() => index === 0 ? input.current?.click() : undefined} title={index ? `${label} integration coming soon` : undefined}><Icon size={17} /><span>{label}</span></button>)}
    </section>
  );
}
