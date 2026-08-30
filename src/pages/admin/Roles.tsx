import { ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useApi, useApiMutation } from "../../lib/hooks";
import { useSessionContext } from "../../lib/session";
import {
  Badge,
  Card,
  Empty,
  ErrorBanner,
  Modal,
  PageHead,
  QueryState,
  Table,
  TextField,
} from "../../components/ui";
import { humanise } from "../../lib/format";
import type { PermissionGroup, Role } from "../../lib/types";

/**
 * Roles.
 *
 * Roles are DATA — a business can invent "Senior Cashier" without a deploy — but
 * the permissions they bundle are code, because each one corresponds to a branch
 * an endpoint actually takes. So a role may only ever be built from the
 * catalogue below.
 *
 * Editing a role changes what everyone holding it can do, which is why it takes
 * the same permission as granting a role directly.
 */
export function Roles() {
  const { can } = useSessionContext();
  const [editing, setEditing] = useState<Role | "new" | null>(null);

  const roles = useApi<Role[]>(["admin", "roles"], "/roles");

  return (
    <>
      <PageHead
        title="Roles"
        subtitle="Named bundles of permissions"
        actions={
          can("user:assign_role") ? (
            <button type="button" className="primary" onClick={() => setEditing("new")}>
              New role
            </button>
          ) : null
        }
      />

      <Card flush>
        <QueryState query={roles} empty={<Empty icon={<ShieldCheck size={14} aria-hidden />} title="No roles" />}>
          <Table
            head={
              <tr>
                <th>Role</th>
                <th>Description</th>
                <th className="num">Permissions</th>
                <th className="num">People</th>
                <th />
              </tr>
            }
          >
            {(roles.data ?? []).map((role) => (
              <tr key={role.id}>
                <td>
                  {role.name}
                  <span className="sub">{role.code}</span>
                </td>
                <td className="small">{role.description ?? "—"}</td>
                <td className="num">{role.permissions.length}</td>
                <td className="num">{role.userCount}</td>
                <td>
                  <div className="btn-row">
                    {role.isSystem ? <Badge tone="neutral">Built in</Badge> : null}
                    {can("user:assign_role") ? (
                      <button type="button" className="sm" onClick={() => setEditing(role)}>
                        Edit
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        </QueryState>
      </Card>

      {editing ? (
        <RoleModal
          role={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            void roles.refetch();
          }}
        />
      ) : null}
    </>
  );
}

function RoleModal({
  role,
  onClose,
  onDone,
}: {
  role: Role | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [name, setName] = useState(role?.name ?? "");
  const [code, setCode] = useState(role?.code ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [permissions, setPermissions] = useState<string[]>(role?.permissions ?? []);

  const catalogue = useApi<PermissionGroup[]>(
    ["admin", "permission-catalogue"],
    "/roles/permissions",
  );

  const save = useApiMutation<Record<string, unknown>, unknown>(
    role ? `/roles/${role.id}` : "/roles",
    { method: role ? "PATCH" : "POST", invalidate: [["admin"]], onSuccess: onDone },
  );

  const remove = useApiMutation<undefined, unknown>(`/roles/${role?.id}`, {
    method: "DELETE",
    invalidate: [["admin"]],
    onSuccess: onDone,
  });

  function toggle(permission: string, on: boolean) {
    setPermissions((current) =>
      on ? [...current, permission] : current.filter((p) => p !== permission),
    );
  }

  function toggleModule(group: PermissionGroup, on: boolean) {
    const codes = group.permissions.map((p) => p.code);
    setPermissions((current) =>
      on
        ? [...new Set([...current, ...codes])]
        : current.filter((p) => !codes.includes(p)),
    );
  }

  return (
    <Modal
      title={role ? `Edit ${role.name}` : "New role"}
      onClose={onClose}
      footer={
        <>
          {role && !role.isSystem ? (
            <button
              type="button"
              className="danger"
              disabled={remove.isPending || role.userCount > 0}
              title={
                role.userCount > 0
                  ? "Reassign the people holding this role first"
                  : undefined
              }
              onClick={() => remove.mutate(undefined)}
            >
              Delete
            </button>
          ) : null}
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            disabled={!name || permissions.length === 0 || save.isPending}
            onClick={() =>
              save.mutate(
                role
                  ? { name, description: description || null, permissions }
                  : { code, name, description: description || undefined, permissions },
              )
            }
          >
            {save.isPending ? "Saving..." : "Save role"}
          </button>
        </>
      }
    >
      <ErrorBanner error={save.error ?? remove.error} />

      {role?.isSystem ? (
        <div className="alert">
          This is a built-in role. Its permissions can be changed, but it cannot be renamed or
          deleted — the seed recreates it by code on every deploy.
        </div>
      ) : null}

      <div className="grid cols-2">
        <TextField
          label="Name"
          disabled={role?.isSystem}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        {!role ? (
          <TextField
            label="Code"
            help="Lowercase, e.g. senior_cashier."
            value={code}
            onChange={(e) => setCode(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))}
          />
        ) : null}
      </div>
      <TextField
        label="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />

      <h3 className="mt mb">Permissions ({permissions.length} selected)</h3>

      {(catalogue.data ?? []).map((group) => {
        const codes = group.permissions.map((p) => p.code);
        const all = codes.every((c) => permissions.includes(c));

        return (
          <div className="mb" key={group.module}>
            <div className="spread">
              <strong>{humanise(group.module)}</strong>
              <button
                type="button"
                className="ghost sm"
                onClick={() => toggleModule(group, !all)}
              >
                {all ? "Clear all" : "Select all"}
              </button>
            </div>
            {group.permissions.map((permission) => (
              <label className="row small" key={permission.code}>
                <input
                  type="checkbox"
                  checked={permissions.includes(permission.code)}
                  onChange={(e) => toggle(permission.code, e.target.checked)}
                />
                <span>
                  {permission.description}
                  <span className="sub">{permission.code}</span>
                </span>
              </label>
            ))}
          </div>
        );
      })}
    </Modal>
  );
}
