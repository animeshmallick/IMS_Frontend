import { useState } from "react";
import { useApi, useApiMutation } from "../../lib/hooks";
import { useSessionContext } from "../../lib/session";
import {
  Card,
  Empty,
  ErrorBanner,
  Field,
  Modal,
  PageHead,
  Table,
  TextField,
  useDebounced,
} from "../../components/ui";
import { money } from "../../lib/format";
import type { Customer } from "../../lib/types";

/**
 * Customers.
 *
 * Attached to a bill only when someone wants a record — most counter sales are
 * walk-ins and stay anonymous. The lookup is a SEARCH rather than a list,
 * because at a till you know the phone number and want one row, not a directory.
 */
export function Customers() {
  const { can } = useSessionContext();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Customer | "new" | null>(null);

  const debounced = useDebounced(search);

  const customers = useApi<Customer[]>(
    ["partners", "customers", debounced],
    "/partners/customers/search",
    { q: debounced, limit: 50 },
    { enabled: debounced.trim().length > 0 },
  );

  return (
    <>
      <PageHead
        title="Customers"
        subtitle="Search by phone or name — most counter sales are anonymous walk-ins"
        actions={
          can("customer:write") ? (
            <button type="button" className="primary" onClick={() => setEditing("new")}>
              New customer
            </button>
          ) : null
        }
      />

      <div className="filters">
        <Field label="Search">
          <input
            value={search}
            placeholder="Phone number or name"
            onChange={(e) => setSearch(e.target.value)}
          />
        </Field>
      </div>

      <Card flush>
        {debounced.trim().length === 0 ? (
          <Empty
            title="Search for a customer"
            hint="Type a phone number or name to find someone."
          />
        ) : customers.isPending ? (
          <p className="loading">Searching...</p>
        ) : (customers.data?.length ?? 0) === 0 ? (
          <Empty title="Nobody matches" hint={`No customer found for “${debounced}”.`} />
        ) : (
          <Table
            head={
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Email</th>
                <th className="num">Credit limit</th>
                <th />
              </tr>
            }
          >
            {(customers.data ?? []).map((customer) => (
              <tr key={customer.id}>
                <td>
                  {customer.name}
                  {customer.code ? <span className="sub">{customer.code}</span> : null}
                </td>
                <td className="small">{customer.phone ?? "—"}</td>
                <td className="small">{customer.email ?? "—"}</td>
                <td className="num muted">
                  {customer.creditLimit ? money(customer.creditLimit) : "—"}
                </td>
                <td>
                  {can("customer:write") ? (
                    <button type="button" className="sm" onClick={() => setEditing(customer)}>
                      Edit
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {editing ? (
        <CustomerModal
          customer={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            void customers.refetch();
          }}
        />
      ) : null}
    </>
  );
}

function CustomerModal({
  customer,
  onClose,
  onDone,
}: {
  customer: Customer | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [name, setName] = useState(customer?.name ?? "");
  const [phone, setPhone] = useState(customer?.phone ?? "");
  const [email, setEmail] = useState(customer?.email ?? "");
  const [creditLimit, setCreditLimit] = useState(customer?.creditLimit ?? "");

  const save = useApiMutation<Record<string, unknown>, unknown>(
    customer ? `/partners/customers/${customer.id}` : "/partners/customers",
    {
      method: customer ? "PATCH" : "POST",
      invalidate: [["partners"]],
      onSuccess: onDone,
    },
  );

  return (
    <Modal
      narrow
      title={customer ? `Edit ${customer.name}` : "New customer"}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            disabled={!name || save.isPending}
            onClick={() =>
              save.mutate({
                name,
                phone: phone || undefined,
                email: email || undefined,
                creditLimit: creditLimit || undefined,
              })
            }
          >
            {save.isPending ? "Saving..." : "Save"}
          </button>
        </>
      }
    >
      <ErrorBanner error={save.error} />
      <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} />
      <TextField label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
      <TextField
        label="Email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <TextField
        label="Credit limit"
        inputMode="decimal"
        value={creditLimit}
        onChange={(e) => setCreditLimit(e.target.value)}
      />
    </Modal>
  );
}
