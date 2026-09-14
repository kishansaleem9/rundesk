import { ChevronDown, Mic, MonitorUp, Video } from "lucide-react";
import { useRef, useState } from "react";

export default function ClipRecorderMenu() {
  const recorder = useRef<MediaRecorder | null>(null);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState("");

  async function toggleRecording() {
    if (recording) {
      recorder.current?.stop();
      setRecording(false);
      return;
    }
    try {
      setError("");
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      const nextRecorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      nextRecorder.ondataavailable = event => chunks.push(event.data);
      nextRecorder.onstop = () => {
        stream.getTracks().forEach(track => track.stop());
        const url = URL.createObjectURL(new Blob(chunks, { type: nextRecorder.mimeType }));
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `rundesk-clip-${Date.now()}.webm`;
        anchor.click();
        URL.revokeObjectURL(url);
      };
      nextRecorder.start();
      recorder.current = nextRecorder;
      setRecording(true);
    } catch (reason) {
      setError(reason instanceof Error && reason.name === "NotAllowedError" ? "Screen access was denied. Allow access to record a clip." : "Screen recording is not supported in this browser.");
    }
  }

  return (
    <section className="popover clip-menu" role="dialog" aria-label="Record a clip">
      <h2>Record a Clip</h2>
      <button className="clip-select"><MonitorUp size={17} /><span>Entire screen</span><ChevronDown size={15} /></button>
      <button className="clip-select"><Video size={17} /><span>1080p Full HD</span><ChevronDown size={15} /></button>
      <label className="mic-permission"><span><Mic size={16} />Allow mic access</span><input type="checkbox" defaultChecked /><i /></label>
      {error && <p className="clip-error">{error}</p>}
      <button className={`record-button ${recording ? "recording" : ""}`} onClick={toggleRecording}><i />{recording ? "Stop Recording" : "Record Clip"}</button>
    </section>
  );
}
