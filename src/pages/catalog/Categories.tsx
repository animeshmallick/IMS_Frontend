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
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editingBrand, setEditingBrand] = useState<Brand | null>(null);

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
                  {can("catalog:write") ? <th /> : null}
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
                  {can("catalog:write") ? (
                    <td className="right">
                      <button
                        type="button"
                        className="ghost sm"
                        onClick={() => setEditingCategory(category)}
                      >
                        Edit
                      </button>
                    </td>
                  ) : null}
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
                  {can("catalog:write") ? <th /> : null}
                </tr>
              }
            >
              {(brands.data ?? []).map((brand) => (
                <tr key={brand.id}>
                  <td>{brand.name}</td>
                  <td className="small muted">{brand.manufacturer ?? "—"}</td>
                  {can("catalog:write") ? (
                    <td className="right">
                      <button
                        type="button"
                        className="ghost sm"
                        onClick={() => setEditingBrand(brand)}
                      >
                        Edit
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </Table>
          </QueryState>
        </Card>
      </div>

      {editingCategory ? (
        <EditCategory
          category={editingCategory}
          onClose={() => setEditingCategory(null)}
          onDone={() => {
            setEditingCategory(null);
            void categories.refetch();
          }}
        />
      ) : null}

      {editingBrand ? (
        <EditBrand
          brand={editingBrand}
          onClose={() => setEditingBrand(null)}
          onDone={() => {
            setEditingBrand(null);
            void brands.refetch();
          }}
        />
      ) : null}

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

/**
 * Rename a category, or take it out of use.
 *
 * "Delete" is an archive. A category is referenced by products, by old purchase
 * orders and by every report ever run, so removing the row would leave those
 * pointing at nothing — and a report from last quarter would quietly stop
 * saying which part of the shop its numbers came from.
 *
 * The archive is refused while anything still depends on it, and the server
 * says exactly what: how many products, or how many sub-categories. That
 * message is the useful part, so it is shown as-is rather than replaced with
 * something generic.
 */
function EditCategory({
  category,
  onClose,
  onDone,
}: {
  category: Category;
  onClose: () => void;
  onDone: () => void;
}) {
  const [name, setName] = useState(category.name);

  const save = useApiMutation<{ name: string }, unknown>(
    `/catalog/categories/${category.id}`,
    { method: "PATCH", invalidate: [["catalog", "categories"]], onSuccess: onDone },
  );

  const archive = useApiMutation<undefined, unknown>(`/catalog/categories/${category.id}`, {
    method: "DELETE",
    invalidate: [["catalog", "categories"]],
    onSuccess: onDone,
  });

  return (
    <Modal
      title={`Edit ${category.name}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            disabled={!name.trim() || save.isPending}
            onClick={() => save.mutate({ name: name.trim() })}
          >
            Save
          </button>
        </>
      }
    >
      <ErrorBanner error={save.error ?? archive.error} />

      <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} />

      {/*
        * The path is derived from the slug and the tree, so it is shown rather
        * than edited: renaming is a label change, and quietly rewriting the
        * path would move every product underneath it.
        */}
      <p className="hint mt">
        Path <code>{category.path}</code>. Renaming changes the label only — to move it, change
        its parent.
      </p>

      <hr />

      <h3>Take out of use</h3>
      <p className="hint">
        It stops appearing when adding products, but old orders and reports keep showing it.
        Refused while any product or sub-category still depends on it.
      </p>
      <button
        type="button"
        className="danger"
        disabled={archive.isPending}
        onClick={() => archive.mutate(undefined)}
      >
        Archive this category
      </button>
    </Modal>
  );
}

/** The same for a brand: rename, change the manufacturer, or take it out of use. */
function EditBrand({
  brand,
  onClose,
  onDone,
}: {
  brand: Brand;
  onClose: () => void;
  onDone: () => void;
}) {
  const [name, setName] = useState(brand.name);
  const [manufacturer, setManufacturer] = useState(brand.manufacturer ?? "");

  const save = useApiMutation<{ name: string; manufacturer: string | null }, unknown>(
    `/catalog/brands/${brand.id}`,
    { method: "PATCH", invalidate: [["catalog", "brands"]], onSuccess: onDone },
  );

  const archive = useApiMutation<undefined, unknown>(`/catalog/brands/${brand.id}`, {
    method: "DELETE",
    invalidate: [["catalog", "brands"]],
    onSuccess: onDone,
  });

  return (
    <Modal
      title={`Edit ${brand.name}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            disabled={!name.trim() || save.isPending}
            onClick={() =>
              save.mutate({ name: name.trim(), manufacturer: manufacturer.trim() || null })
            }
          >
            Save
          </button>
        </>
      }
    >
      <ErrorBanner error={save.error ?? archive.error} />

      <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} />
      <TextField
        label="Manufacturer"
        value={manufacturer}
        placeholder="Optional"
        onChange={(e) => setManufacturer(e.target.value)}
      />

      <hr />

      <h3>Take out of use</h3>
      <p className="hint">
        Refused while any product still carries it. The brand stays readable on old documents,
        so a purchase order from last year still shows the name it was raised with.
      </p>
      <button
        type="button"
        className="danger"
        disabled={archive.isPending}
        onClick={() => archive.mutate(undefined)}
      >
        Archive this brand
      </button>
    </Modal>
  );
}
