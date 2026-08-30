import { Users } from "lucide-react";
import { useState } from "react";
import { useApi, useApiList, useApiMutation } from "../../lib/hooks";
import { useSessionContext } from "../../lib/session";
import {
  Badge,
  Card,
  Empty,
  ErrorBanner,
  Field,
  Modal,
  PageHead,
  Pager,
  QueryState,
  Table,
  TextField,
  useDebounced,
} from "../../components/ui";
import { SearchField } from "../../components/filters";
import type { Location, Role, StaffUser } from "../../lib/types";

/**
 * Staff administration.
 *
 * Two separate decisions, and two separate permissions: `user:write` creates the
 * account, `user:assign_role` decides what it can do and where. A business will
 * not always trust the same person with both, and holding one without the other
 * is a normal arrangement rather than an edge case.
 *
 * Accounts are never deleted — deactivated. Removing the row would orphan every
 * approval, bill and ledger entry naming that person.
 */
export function Staff() {
  const { can } = useSessionContext();
  const [search, setSearch] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [offset, setOffset] = useState(0);
  const [editing, setEditing] = useState<StaffUser | "new" | null>(null);
  const [access, setAccess] = useState<StaffUser | null>(null);
  const limit = 25;

  const debounced = useDebounced(search);

  const staff = useApiList<StaffUser>(["admin", "users"], "/users", {
    search: debounced || undefined,
    includeInactive: includeInactive || undefined,
    limit,
    offset,
  });

  return (
    <>
      <PageHead
        title="Staff"
        subtitle="Who can sign in, what they may do, and where they may do it"
        actions={
          can("user:write") ? (
            <button type="button" className="primary" onClick={() => setEditing("new")}>
              Add staff member
            </button>
          ) : null
        }
      />

      <div className="filters">
        <SearchField
          value={search}
          placeholder="Name, email or employee code"
          onChange={(value) => {
            setSearch(value);
            setOffset(0);
          }}
        />
        <label className="check">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(e) => {
                setIncludeInactive(e.target.checked);
                setOffset(0);
              }}
            />
            Include deactivated
          </label>
      </div>

      <Card flush>
        <QueryState
          query={{ ...staff, data: staff.data?.items }}
          empty={<Empty icon={<Users size={14} aria-hidden />} title="No staff found" />}
        >
          <Table
            head={
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Roles</th>
                <th>Locations</th>
                <th>Status</th>
                <th />
              </tr>
            }
          >
            {(staff.data?.items ?? []).map((person) => (
              <tr key={person.id}>
                <td>
                  {person.name}
                  {person.employeeCode ? <span className="sub">{person.employeeCode}</span> : null}
                </td>
                <td className="small">{person.email}</td>
                <td>
                  {person.roles.length === 0 ? (
                    <Badge tone="warn">No role</Badge>
                  ) : (
                    person.roles.map((role) => (
                      <Badge key={role.id} tone="info">
                        {role.name}
                      </Badge>
                    ))
                  )}
                </td>
                <td className="small">
                  {person.locations.length === 0 ? (
                    <Badge tone="warn">None</Badge>
                  ) : (
                    person.locations.map((l) => l.name).join(", ")
                  )}
                </td>
                <td>
                  <Badge tone={person.isActive ? "success" : "neutral"}>
                    {person.isActive ? "Active" : "Deactivated"}
                  </Badge>
                </td>
                <td>
                  <div className="btn-row">
                    {can("user:write") ? (
                      <button type="button" className="sm" onClick={() => setEditing(person)}>
                        Edit
                      </button>
                    ) : null}
                    {can("user:assign_role") ? (
                      <button type="button" className="sm" onClick={() => setAccess(person)}>
                        Access
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        </QueryState>

        <div className="card-foot">
          <Pager total={staff.data?.total ?? 0} limit={limit} offset={offset} onChange={setOffset} />
        </div>
      </Card>

      {editing ? (
        <StaffModal
          person={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            void staff.refetch();
          }}
        />
      ) : null}

      {access ? (
        <AccessModal
          person={access}
          onClose={() => setAccess(null)}
          onDone={() => {
            setAccess(null);
            void staff.refetch();
          }}
        />
      ) : null}
    </>
  );
}

function StaffModal({
  person,
  onClose,
  onDone,
}: {
  person: StaffUser | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [name, setName] = useState(person?.name ?? "");
  const [email, setEmail] = useState(person?.email ?? "");
  const [password, setPassword] = useState("");
  const [employeeCode, setEmployeeCode] = useState(person?.employeeCode ?? "");
  const [phone, setPhone] = useState(person?.phone ?? "");
  const [isActive, setIsActive] = useState(person?.isActive ?? true);

  const save = useApiMutation<Record<string, unknown>, unknown>(
    person ? `/users/${person.id}` : "/users",
    { method: person ? "PATCH" : "POST", invalidate: [["admin"]], onSuccess: onDone },
  );

  const resetPassword = useApiMutation<Record<string, unknown>, unknown>(
    `/users/${person?.id}/password`,
    { method: "PUT", invalidate: [["admin"]] },
  );

  return (
    <Modal
      title={person ? `Edit ${person.name}` : "New staff member"}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            disabled={!name || !email || (!person && password.length < 10) || save.isPending}
            onClick={() =>
              save.mutate(
                person
                  ? {
                      name,
                      employeeCode: employeeCode || null,
                      phone: phone || null,
                      isActive,
                    }
                  : {
                      name,
                      email,
                      password,
                      employeeCode: employeeCode || undefined,
                      phone: phone || undefined,
                    },
              )
            }
          >
            {save.isPending ? "Saving..." : "Save"}
          </button>
        </>
      }
    >
      <ErrorBanner error={save.error ?? resetPassword.error} />

      <div className="grid cols-2">
        <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <TextField
          label="Email"
          type="email"
          disabled={Boolean(person)}
          help={person ? "Sign-in email cannot be changed." : "Used to sign in."}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <TextField
          label="Employee code"
          value={employeeCode}
          onChange={(e) => setEmployeeCode(e.target.value)}
        />
        <TextField label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>

      {!person ? (
        <TextField
          label="Password"
          type="password"
          help="At least 10 characters. Give it to them directly and ask them to change it."
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      ) : (
        <>
          <label className="row small mb">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            Active — a deactivated account keeps its history but cannot sign in
          </label>

          <Field
            label="Reset password"
            help="Every existing session for this person is signed out."
          >
            <div className="inline-form">
              <input
                type="password"
                value={password}
                placeholder="New password"
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                disabled={password.length < 10 || resetPassword.isPending}
                onClick={() =>
                  resetPassword.mutate({ password }, { onSuccess: () => setPassword("") })
                }
              >
                {resetPassword.isPending ? "Resetting..." : "Reset"}
              </button>
            </div>
          </Field>
          {resetPassword.isSuccess ? (
            <div className="alert success">Password changed and all sessions signed out.</div>
          ) : null}
        </>
      )}
    </Modal>
  );
}

/**
 * Roles and locations together, because holding a permission means nothing
 * without a location to exercise it at — a cashier with `sale:create` and no
 * store assigned cannot sell anywhere.
 */
function AccessModal({
  person,
  onClose,
  onDone,
}: {
  person: StaffUser;
  onClose: () => void;
  onDone: () => void;
}) {
  const [roleIds, setRoleIds] = useState<string[]>(person.roles.map((r) => r.id));
  const [locationIds, setLocationIds] = useState<string[]>(person.locations.map((l) => l.id));
  const [primaryLocationId, setPrimary] = useState(
    person.locations.find((l) => l.isPrimary)?.id ?? "",
  );

  const roles = useApi<Role[]>(["admin", "roles"], "/roles");
  const locations = useApi<Location[]>(["locations"], "/locations");
  const effective = useApi<string[]>(
    ["admin", "user-permissions", person.id],
    `/users/${person.id}/permissions`,
  );

  const saveRoles = useApiMutation<Record<string, unknown>, unknown>(
    `/users/${person.id}/roles`,
    { method: "PUT", invalidate: [["admin"]] },
  );
  const saveLocations = useApiMutation<Record<string, unknown>, unknown>(
    `/users/${person.id}/locations`,
    { method: "PUT", invalidate: [["admin"]] },
  );

  async function save() {
    await saveRoles.mutateAsync({ roleIds });
    await saveLocations.mutateAsync({
      locationIds,
      primaryLocationId: primaryLocationId || null,
    });
    onDone();
  }

  const pending = saveRoles.isPending || saveLocations.isPending;

  return (
    <Modal
      title={`Access — ${person.name}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="primary" disabled={pending} onClick={() => void save()}>
            {pending ? "Saving..." : "Save access"}
          </button>
        </>
      }
    >
      <ErrorBanner error={saveRoles.error ?? saveLocations.error} />

      <div className="grid cols-2">
        <div>
          <h3 className="mb">Roles</h3>
          {(roles.data ?? []).map((role) => (
            <label className="row small mb" key={role.id}>
              <input
                type="checkbox"
                checked={roleIds.includes(role.id)}
                onChange={(e) =>
                  setRoleIds((current) =>
                    e.target.checked
                      ? [...current, role.id]
                      : current.filter((id) => id !== role.id),
                  )
                }
              />
              <span>
                {role.name}
                <span className="sub">{role.description}</span>
              </span>
            </label>
          ))}
        </div>

        <div>
          <h3 className="mb">Locations</h3>
          {(locations.data ?? [])
            .filter((l) => l.isPhysical && !l.isSystem)
            .map((location) => (
              <label className="row small mb" key={location.id}>
                <input
                  type="checkbox"
                  checked={locationIds.includes(location.id)}
                  onChange={(e) =>
                    setLocationIds((current) =>
                      e.target.checked
                        ? [...current, location.id]
                        : current.filter((id) => id !== location.id),
                    )
                  }
                />
                {location.name}
              </label>
            ))}

          <Field label="Default location" help="Pre-selected when they sign in.">
            <select value={primaryLocationId} onChange={(e) => setPrimary(e.target.value)}>
              <option value="">None</option>
              {(locations.data ?? [])
                .filter((l) => locationIds.includes(l.id))
                .map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
            </select>
          </Field>
        </div>
      </div>

      {(effective.data?.length ?? 0) > 0 ? (
        <>
          <h3 className="mt mb">Currently grants {effective.data!.length} permissions</h3>
          <p className="small muted">{effective.data!.join(", ")}</p>
        </>
      ) : null}
    </Modal>
  );
}
