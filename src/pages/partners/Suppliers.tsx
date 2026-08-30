import { useState } from "react";
import { useApiList, useApiMutation } from "../../lib/hooks";
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
import type { Supplier } from "../../lib/types";

/** Who you buy from. */
export function Suppliers() {
  const { can } = useSessionContext();
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [editing, setEditing] = useState<Supplier | "new" | null>(null);
  const limit = 25;

  const debounced = useDebounced(search);
  const suppliers = useApiList<Supplier>(["partners", "suppliers"], "/partners/suppliers", {
    search: debounced || undefined,
    limit,
    offset,
  });

  return (
    <>
      <PageHead
        title="Suppliers"
        subtitle="Wholesalers and distributors you raise purchase orders against"
        actions={
          can("supplier:write") ? (
            <button type="button" className="primary" onClick={() => setEditing("new")}>
              New supplier
            </button>
          ) : null
        }
      />

      <div className="filters">
        <Field label="Search">
          <input
            value={search}
            placeholder="Name or code"
            onChange={(e) => {
              setSearch(e.target.value);
              setOffset(0);
            }}
          />
        </Field>
      </div>

      <Card flush>
        <QueryState
          query={{ ...suppliers, data: suppliers.data?.items }}
          empty={<Empty title="No suppliers" hint="Add the wholesalers you buy from." />}
        >
          <Table
            head={
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Contact</th>
                <th className="num">Lead time</th>
                <th>Terms</th>
                <th>Status</th>
                <th />
              </tr>
            }
          >
            {(suppliers.data?.items ?? []).map((supplier) => (
              <tr key={supplier.id}>
                <td>{supplier.code}</td>
                <td>
                  {supplier.name}
                  {supplier.contactPerson ? (
                    <span className="sub">{supplier.contactPerson}</span>
                  ) : null}
                </td>
                <td className="small">
                  {supplier.phone ?? "—"}
                  {supplier.email ? <span className="sub">{supplier.email}</span> : null}
                </td>
                <td className="num">{supplier.leadTimeDays} days</td>
                <td className="small">{supplier.paymentTerms ?? "—"}</td>
                <td>
                  <Badge tone={supplier.isActive ? "success" : "neutral"}>
                    {supplier.isActive ? "Active" : "Inactive"}
                  </Badge>
                </td>
                <td>
                  {can("supplier:write") ? (
                    <button type="button" className="sm" onClick={() => setEditing(supplier)}>
                      Edit
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </Table>
        </QueryState>

        <div className="card-foot">
          <Pager
            total={suppliers.data?.total ?? 0}
            limit={limit}
            offset={offset}
            onChange={setOffset}
          />
        </div>
      </Card>

      {editing ? (
        <SupplierModal
          supplier={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            void suppliers.refetch();
          }}
        />
      ) : null}
    </>
  );
}

function SupplierModal({
  supplier,
  onClose,
  onDone,
}: {
  supplier: Supplier | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [code, setCode] = useState(supplier?.code ?? "");
  const [name, setName] = useState(supplier?.name ?? "");
  const [contactPerson, setContact] = useState(supplier?.contactPerson ?? "");
  const [phone, setPhone] = useState(supplier?.phone ?? "");
  const [email, setEmail] = useState(supplier?.email ?? "");
  const [leadTimeDays, setLeadTime] = useState(String(supplier?.leadTimeDays ?? 7));
  const [paymentTerms, setTerms] = useState(supplier?.paymentTerms ?? "");
  const [isActive, setActive] = useState(supplier?.isActive ?? true);

  const archive = useApiMutation<undefined, unknown>(
    `/partners/suppliers/${supplier?.id}`,
    { method: "DELETE", invalidate: [["partners"]], onSuccess: onDone },
  );

  const save = useApiMutation<Record<string, unknown>, unknown>(
    supplier ? `/partners/suppliers/${supplier.id}` : "/partners/suppliers",
    {
      method: supplier ? "PATCH" : "POST",
      invalidate: [["partners"]],
      onSuccess: onDone,
    },
  );

  return (
    <Modal
      title={supplier ? `Edit ${supplier.name}` : "New supplier"}
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
              save.mutate({
                ...(supplier ? {} : { code }),
                name,
                contactPerson: contactPerson || undefined,
                phone: phone || undefined,
                email: email || undefined,
                leadTimeDays: Number(leadTimeDays),
                paymentTerms: paymentTerms || undefined,
                ...(supplier ? { isActive } : {}),
              })
            }
          >
            {save.isPending ? "Saving..." : "Save"}
          </button>
        </>
      }
    >
      <ErrorBanner error={save.error} />

      <div className="grid cols-2">
        <TextField
          label="Code"
          disabled={Boolean(supplier)}
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
        />
        <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <TextField
          label="Contact person"
          value={contactPerson}
          onChange={(e) => setContact(e.target.value)}
        />
        <TextField label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <TextField
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <TextField
          label="Lead time (days)"
          help="How long from order to delivery — drives reorder suggestions."
          inputMode="numeric"
          value={leadTimeDays}
          onChange={(e) => setLeadTime(e.target.value)}
        />
        <TextField
          label="Payment terms"
          value={paymentTerms}
          onChange={(e) => setTerms(e.target.value)}
        />
      </div>

      {supplier ? (
        <label className="row small">
          <input type="checkbox" checked={isActive} onChange={(e) => setActive(e.target.checked)} />
          Active
        </label>
      ) : null}
      {supplier ? (
        <>
          <hr />
          <h3>Take out of use</h3>
          <p className="hint">They stop appearing when raising a purchase order, but every order ever placed with them keeps showing the name. Refused while any purchase order with them is still open — an outstanding delivery nobody is chasing is worse than a long supplier list.</p>
          <ErrorBanner error={archive.error} />
          <button
            type="button"
            className="danger"
            disabled={archive.isPending}
            onClick={() => archive.mutate(undefined)}
          >
            Archive this supplier
          </button>
        </>
      ) : null}
    </Modal>
  );
}
