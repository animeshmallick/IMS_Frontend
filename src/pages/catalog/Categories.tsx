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
  QueryState,
  Table,
  TextField,
} from "../../components/ui";
import type { Brand, Category } from "../../lib/types";

/**
 * The category tree and brands.
 *
 * Categories carry a MATERIALISED PATH (`/grocery/staples/flour`) alongside the
 * parent pointer, so "everything under grocery" is one indexed prefix scan
 * rather than a recursive query on every product listing and count scope. The
 * cost is that moving a node rewrites its descendants — one UPDATE, and rare.
 */
export function Categories() {
  const { can } = useSessionContext();
  const [addingCategory, setAddingCategory] = useState(false);
  const [addingBrand, setAddingBrand] = useState(false);

  const categories = useApi<Category[]>(["catalog", "categories"], "/catalog/categories");
  const brands = useApi<Brand[]>(["catalog", "brands"], "/catalog/brands");

  return (
    <>
      <PageHead
        title="Categories and brands"
        subtitle="How the catalogue is organised"
        actions={
          can("catalog:write") ? (
            <>
              <button type="button" onClick={() => setAddingBrand(true)}>
                New brand
              </button>
              <button type="button" className="primary" onClick={() => setAddingCategory(true)}>
                New category
              </button>
            </>
          ) : null
        }
      />

      <div className="grid cols-2">
        <Card title="Category tree" flush>
          <QueryState
            query={categories}
            empty={<Empty title="No categories" hint="Add one to organise your products." />}
          >
            <Table
              head={
                <tr>
                  <th>Name</th>
                  <th>Path</th>
                </tr>
              }
            >
              {(categories.data ?? []).map((category) => (
                <tr key={category.id}>
                  <td style={{ paddingLeft: `${0.7 + category.depth * 1.2}rem` }}>
                    {category.depth > 0 ? "└ " : ""}
                    {category.name}
                  </td>
                  <td className="small muted">{category.path}</td>
                </tr>
              ))}
            </Table>
          </QueryState>
        </Card>

        <Card title="Brands" flush>
          <QueryState query={brands} empty={<Empty title="No brands" />}>
            <Table
              head={
                <tr>
                  <th>Name</th>
                  <th>Manufacturer</th>
                </tr>
              }
            >
              {(brands.data ?? []).map((brand) => (
                <tr key={brand.id}>
                  <td>{brand.name}</td>
                  <td className="small muted">{brand.manufacturer ?? "—"}</td>
                </tr>
              ))}
            </Table>
          </QueryState>
        </Card>
      </div>

      {addingCategory ? (
        <CategoryModal
          categories={categories.data ?? []}
          onClose={() => setAddingCategory(false)}
          onDone={() => {
            setAddingCategory(false);
            void categories.refetch();
          }}
        />
      ) : null}

      {addingBrand ? (
        <BrandModal
          onClose={() => setAddingBrand(false)}
          onDone={() => {
            setAddingBrand(false);
            void brands.refetch();
          }}
        />
      ) : null}
    </>
  );
}

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

function CategoryModal({
  categories,
  onClose,
  onDone,
}: {
  categories: Category[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");

  const create = useApiMutation<Record<string, unknown>, unknown>("/catalog/categories", {
    method: "POST",
    invalidate: [["catalog"]],
    onSuccess: onDone,
  });

  return (
    <Modal
      narrow
      title="New category"
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            disabled={!name || create.isPending}
            onClick={() =>
              create.mutate({ name, slug: slugify(name), parentId: parentId || undefined })
            }
          >
            {create.isPending ? "Creating..." : "Create"}
          </button>
        </>
      }
    >
      <ErrorBanner error={create.error} />
      <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} />
      <Field label="Sits under" help="Leave blank for a top-level category.">
        <select value={parentId} onChange={(e) => setParentId(e.target.value)}>
          <option value="">Top level</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {"— ".repeat(category.depth)}
              {category.name}
            </option>
          ))}
        </select>
      </Field>
      {name ? <p className="small muted">Path will be /{slugify(name)}</p> : null}
    </Modal>
  );
}

function BrandModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState("");
  const [manufacturer, setManufacturer] = useState("");

  const create = useApiMutation<Record<string, unknown>, unknown>("/catalog/brands", {
    method: "POST",
    invalidate: [["catalog"]],
    onSuccess: onDone,
  });

  return (
    <Modal
      narrow
      title="New brand"
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            disabled={!name || create.isPending}
            onClick={() =>
              create.mutate({
                name,
                slug: slugify(name),
                manufacturer: manufacturer || undefined,
              })
            }
          >
            {create.isPending ? "Creating..." : "Create"}
          </button>
        </>
      }
    >
      <ErrorBanner error={create.error} />
      <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} />
      <TextField
        label="Manufacturer"
        value={manufacturer}
        onChange={(e) => setManufacturer(e.target.value)}
      />
    </Modal>
  );
}
