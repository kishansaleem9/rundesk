import type { User } from "@/lib/rundesk/types";

export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).map(part => part[0]).join("").slice(0, 2).toUpperCase();
}

export default function Avatar({ user, size = 28, className = "" }: { user: Pick<User, "name" | "avatar">; size?: number; className?: string }) {
  const style = user.avatar
    ? { width: size, height: size, backgroundImage: `url(${JSON.stringify(user.avatar).slice(1, -1)})` }
    : { width: size, height: size };
  return <span className={`rd-avatar ${user.avatar ? "has-image" : ""} ${className}`} style={style} aria-label={user.name} title={user.name}>{user.avatar ? null : initials(user.name)}</span>;
}
