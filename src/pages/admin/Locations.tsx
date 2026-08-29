import { useState } from "react";
import { useApi, useApiMutation } from "../../lib/hooks";
import { useSessionContext } from "../../lib/session";
import {
  Badge,
  Card,
  Empty,
  ErrorBanner,
  Field,
  Modal,
  PageHead,
  QueryState,
  Table,
  TextField,
} from "../../components/ui";
import { humanise } from "../../lib/format";
import type { Location } from "../../lib/types";

/**
 * Warehouses and stores.
 *
 * A store is not a special entity — it is a location with `type = 'store'`. That
 * is what lets warehouse-to-store transfer, counter sale, damage write-off and
 * PO receipt all be the same mechanic against different counterparties.
 *
 * The virtual system locations (supplier, customer, scrap, variance, transit)
 * are shown but not editable: the ledger references them by code and depends on
 * there being exactly one of each.
 */
export function LocationsAdmin() {
  const { can } = useSessionContext();
  const [editing, setEditing] = useState<Location | "new" | null>(null);

  const locations = useApi<Location[]>(["locations"], "/locations");

  const real = (locations.data ?? []).filter((l) => !l.isSystem);
  const virtual = (locations.data ?? []).filter((l) => l.isSystem);

  return (
    <>
      <PageHead
        title="Locations"
        subtitle="Your warehouses and stores"
        actions={
          can("location:write") ? (
            <button type="button" className="primary" onClick={() => setEditing("new")}>
              New location
            </button>
          ) : null
        }
      />

      <Card title="Warehouses and stores" flush>
        <QueryState
          query={{ ...locations, data: real }}
          empty={<Empty title="No locations" hint="Add the places you hold stock." />}
        >
          <Table
            head={
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Type</th>
                <th>Sells</th>
                <th>Receives</th>
                <th>Status</th>
                <th />
              </tr>
            }
          >
            {real.map((location) => (
              <tr key={location.id}>
                <td>{location.code}</td>
                <td>
                  {location.name}
                  {location.phone ? <span className="sub">{location.phone}</span> : null}
                </td>
                <td>
                  <Badge tone={location.type === "warehouse" ? "info" : "success"}>
                    {humanise(location.type)}
                  </Badge>
                </td>
                <td className="small">{location.allowsSales ? "Yes" : "No"}</td>
                <td className="small">{location.allowsReceipts ? "Yes" : "No"}</td>
                <td>
                  <Badge tone={location.isActive ? "success" : "neutral"}>
                    {location.isActive ? "Active" : "Inactive"}
                  </Badge>
                </td>
                <td>
                  {can("location:write") ? (
                    <button type="button" className="sm" onClick={() => setEditing(location)}>
                      Edit
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </Table>
        </QueryState>
      </Card>

      {virtual.length > 0 ? (
        <Card title="Ledger counterparties" flush>
          <Table
            head={
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Purpose</th>
              </tr>
            }
          >
            {virtual.map((location) => (
              <tr key={location.id}>
                <td className="small">{location.code}</td>
                <td>{location.name}</td>
                <td className="small muted">
                  {location.type === "supplier"
                    ? "Where received stock comes from"
                    : location.type === "customer"
                      ? "Where sold stock goes"
                      : location.type === "scrap"
                        ? "Where written-off stock goes"
                        : location.type === "variance"
                          ? "Balances stock-count differences"
                          : "Holds stock while it is on a vehicle"}
                </td>
              </tr>
            ))}
          </Table>
          <div className="card-body">
            <p className="small muted">
              These make the ledger double-entry: every movement has two signed legs, so the sum
              over all locations for any batch is exactly zero. They are not editable.
            </p>
          </div>
        </Card>
      ) : null}

      {editing ? (
        <LocationModal
          location={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            void locations.refetch();
          }}
        />
      ) : null}
    </>
  );
}

function LocationModal({
  location,
  onClose,
  onDone,
}: {
  location: Location | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [code, setCode] = useState(location?.code ?? "");
  const [name, setName] = useState(location?.name ?? "");
  const [type, setType] = useState<"warehouse" | "store">(
    location?.type === "warehouse" ? "warehouse" : "store",
  );
  const [phone, setPhone] = useState(location?.phone ?? "");
  const [allowsSales, setAllowsSales] = useState(location?.allowsSales ?? true);
  const [allowsReceipts, setAllowsReceipts] = useState(location?.allowsReceipts ?? true);
  const [isActive, setIsActive] = useState(location?.isActive ?? true);

  const save = useApiMutation<Record<string, unknown>, unknown>(
    location ? `/locations/${location.id}` : "/locations",
    { method: location ? "PATCH" : "POST", invalidate: [["locations"]], onSuccess: onDone },
  );

  return (
    <Modal
      narrow
      title={location ? `Edit ${location.name}` : "New location"}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            disabled={!code || !name || save.isPending}
            onClick={() =>
              save.mutate(
                location
                  ? {
                      name,
                      phone: phone || undefined,
                      allowsSales,
                      allowsReceipts,
                      isActive,
                    }
                  : { code, name, type, phone: phone || undefined },
              )
            }
          >
            {save.isPending ? "Saving..." : "Save"}
          </button>
        </>
      }
    >
      <ErrorBanner error={save.error} />

      <TextField
        label="Code"
        disabled={Boolean(location)}
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
      />
      <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} />

      {!location ? (
        <Field label="Type" help="Immutable once created.">
          <select value={type} onChange={(e) => setType(e.target.value as typeof type)}>
            <option value="store">Store — sells at a counter</option>
            <option value="warehouse">Warehouse — holds and distributes stock</option>
          </select>
        </Field>
      ) : null}

      <TextField label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />

      {location ? (
        <>
          <label className="row small">
            <input
              type="checkbox"
              checked={allowsSales}
              onChange={(e) => setAllowsSales(e.target.checked)}
            />
            Can sell at a counter
          </label>
          <label className="row small">
            <input
              type="checkbox"
              checked={allowsReceipts}
              onChange={(e) => setAllowsReceipts(e.target.checked)}
            />
            Can receive deliveries
          </label>
          <label className="row small">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            Active
          </label>
          <p className="small muted mt">
            Deactivating is refused while stock remains here — otherwise nobody could sell, move or
            write off what is still on the shelf.
          </p>
        </>
      ) : null}
    </Modal>
  );
}
