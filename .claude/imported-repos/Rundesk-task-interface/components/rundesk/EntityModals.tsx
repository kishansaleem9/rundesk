"use client";

import { useMemo, useState } from "react";
import {
  Check,
  Folder as FolderIcon,
  Layers3,
  ListTree,
  Search,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import { PERMISSION_META, uid } from "@/lib/store";
import type { PermissionRole, SharePermission } from "@/lib/types";

const roles = Object.keys(PERMISSION_META) as PermissionRole[];

export function SharePermissionsModal({
  entityLabel,
  permissions,
  onChange,
  onClose,
}: {
  entityLabel: "Space" | "Project" | "List" | "Folder" | "Task";
  permissions: SharePermission[];
  onChange: (permissions: SharePermission[]) => void;
  onClose: () => void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<PermissionRole>("VIEW_ONLY");
  const [error, setError] = useState("");

  const share = () => {
    const value = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(value)) {
      setError("Enter a valid email address.");
      return;
    }

    const existing = permissions.find((item) => item.email.toLowerCase() === value);
    if (existing) {
      onChange(
        permissions.map((item) =>
          item.id === existing.id ? { ...item, role } : item
        )
      );
    } else {
      onChange([...permissions, { id: uid("permission"), email: value, role }]);
    }

    setEmail("");
    setError("");
  };

  return (
    <>
      <button className="entity-modal-backdrop" aria-label="Close" onClick={onClose} />
      <section className="entity-modal share-modal" role="dialog" aria-modal="true">
        <div className="entity-modal-title">
          <h2>Share this {entityLabel}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            <X size={22} />
          </button>
        </div>

        <div className="share-controls">
          <input
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setError("");
            }}
            onKeyDown={(event) => event.key === "Enter" && share()}
            placeholder="Invite by email..."
          />
          <select value={role} onChange={(event) => setRole(event.target.value as PermissionRole)}>
            {roles.map((item) => (
              <option key={item} value={item}>{PERMISSION_META[item].label}</option>
            ))}
          </select>
          <button className="share-submit" onClick={share}>
            <UserPlus size={17} /> Share
          </button>
        </div>

        {error && <div className="share-error">{error}</div>}

        <div className="shared-heading">SHARED WITH</div>
        {permissions.length === 0 ? (
          <div className="shared-empty">Not shared with anyone yet</div>
        ) : (
          <div className="shared-list">
            {permissions.map((permission) => (
              <div className="shared-person" key={permission.id}>
                <div className="shared-avatar">{permission.email.charAt(0).toUpperCase()}</div>
                <div className="shared-email">{permission.email}</div>
                <select
                  value={permission.role}
                  onChange={(event) =>
                    onChange(
                      permissions.map((item) =>
                        item.id === permission.id
                          ? { ...item, role: event.target.value as PermissionRole }
                          : item
                      )
                    )
                  }
                >
                  {roles.map((item) => (
                    <option key={item} value={item}>{PERMISSION_META[item].label}</option>
                  ))}
                </select>
                <button
                  className="shared-remove"
                  title="Remove access"
                  onClick={() => onChange(permissions.filter((item) => item.id !== permission.id))}
                >
                  <Trash2 size={17} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="permission-help">
          {roles.map((item) => (
            <div key={item}>
              <strong>{PERMISSION_META[item].label}</strong>
              <span> — {PERMISSION_META[item].description}</span>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

export interface MoveDestination {
  id: string;
  name: string;
  path?: string;
  kind: "space" | "project" | "list";
  current?: boolean;
}

export function MoveModal({
  entityLabel,
  entityName,
  destinations,
  onMove,
  onClose,
}: {
  entityLabel: "project" | "list" | "folder";
  entityName: string;
  destinations: MoveDestination[];
  onMove: (destinationId: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return destinations;
    return destinations.filter((item) =>
      `${item.name} ${item.path ?? ""}`.toLowerCase().includes(q)
    );
  }, [destinations, query]);

  const Icon = ({ kind }: { kind: MoveDestination["kind"] }) => {
    if (kind === "space") return <Layers3 size={20} />;
    if (kind === "project") return <FolderIcon size={20} />;
    return <ListTree size={20} />;
  };

  return (
    <>
      <button className="entity-modal-backdrop" aria-label="Close" onClick={onClose} />
      <section className="entity-modal move-modal" role="dialog" aria-modal="true">
        <div className="entity-modal-title">
          <h2>Move {entityLabel} “{entityName}”</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            <X size={22} />
          </button>
        </div>

        <label className="move-search">
          <Search size={20} />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={entityLabel === "project" ? "Search spaces..." : entityLabel === "list" ? "Search spaces, projects..." : "Search spaces, projects, lists..."}
          />
        </label>

        <div className="move-destinations">
          {filtered.length === 0 && <div className="move-empty">No matching destinations.</div>}
          {filtered.map((destination) => (
            <button
              key={destination.id}
              className={`move-destination ${destination.current ? "is-current" : ""}`}
              disabled={destination.current}
              onClick={() => {
                if (destination.current) return;
                onMove(destination.id);
                onClose();
              }}
            >
              <Icon kind={destination.kind} />
              <span>
                <strong>{destination.name}</strong>
                {destination.path && <small>{destination.path}</small>}
              </span>
              {destination.current && <span className="move-current"><Check size={16} /> Current</span>}
            </button>
          ))}
        </div>
      </section>
    </>
  );
}
