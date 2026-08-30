import { Package } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useApi, useApiList } from "../../lib/hooks";
import { useSessionContext } from "../../lib/session";
import {
  Badge,
  Card,
  Empty,
  Field,
  PageHead,
  Pager,
  QueryState,
  Table,
  useDebounced,
} from "../../components/ui";
import { humanise } from "../../lib/format";
import type { Category, ProductListItem, ProductType } from "../../lib/types";

const TYPES: ProductType[] = [
  "standard",
  "food",
  "pharma",
  "apparel",
  "hardware",
  "electronics",
];

/**
 * The product catalogue.
 *
 * One table serves groceries, hardware, clothing and medicines: the shared
 * columns live on `product`, while type-specific mandatory fields (drug
 * schedule, FSSAI licence, fabric) sit in class tables so their NOT NULL
 * constraints are real rather than advisory.
 */
export function Products() {
  const navigate = useNavigate();
  const { can } = useSessionContext();
  const [search, setSearch] = useState("");
  const [categoryPath, setCategoryPath] = useState("");
  const [productType, setProductType] = useState("");
  const [status, setStatus] = useState("");
  const [offset, setOffset] = useState(0);
  const limit = 25;

  const debounced = useDebounced(search);
  const categories = useApi<Category[]>(["catalog", "categories"], "/catalog/categories");

  const products = useApiList<ProductListItem>(["catalog", "products"], "/catalog/products", {
    search: debounced || undefined,
    categoryPath: categoryPath || undefined,
    productType: productType || undefined,
    status: status || undefined,
    limit,
    offset,
  });

  return (
    <>
      <PageHead
        title="Products"
        subtitle="Everything you sell, whatever kind of thing it is"
        actions={
          can("catalog:write") ? (
            <Link className="btn primary" to="/products/new">
              New product
            </Link>
          ) : null
        }
      />

      <div className="filters">
        <Field label="Search">
          <input
            value={search}
            placeholder="Name, code or SKU"
            onChange={(e) => {
              setSearch(e.target.value);
              setOffset(0);
            }}
          />
        </Field>

        <Field label="Category">
          <select
            value={categoryPath}
            onChange={(e) => {
              setCategoryPath(e.target.value);
              setOffset(0);
            }}
          >
            <option value="">All categories</option>
            {(categories.data ?? []).map((category) => (
              <option key={category.id} value={category.path}>
                {" ".repeat(category.depth * 3)}
                {category.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Type">
          <select
            value={productType}
            onChange={(e) => {
              setProductType(e.target.value);
              setOffset(0);
            }}
          >
            <option value="">All types</option>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {humanise(t)}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Status">
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setOffset(0);
            }}
          >
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="draft">Draft</option>
            <option value="discontinued">Discontinued</option>
          </select>
        </Field>
      </div>

      <Card flush>
        <QueryState
          query={{ ...products, data: products.data?.items }}
          empty={
            <Empty
              icon={<Package size={14} aria-hidden />}
              title="No products"
              hint={can("catalog:write") ? "Add your first product to start trading." : undefined}
            />
          }
        >
          <Table
            head={
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Category</th>
                <th>Brand</th>
                <th>Type</th>
                <th>Stock unit</th>
                <th className="num">SKUs</th>
                <th>Status</th>
              </tr>
            }
          >
            {(products.data?.items ?? []).map((product) => (
              <tr
                key={product.id}
                className="clickable"
                onClick={() => navigate(`/products/${product.id}`)}
              >
                <td>
                  <Link to={`/products/${product.id}`}>{product.code}</Link>
                </td>
                <td>{product.name}</td>
                <td className="small muted">{product.categoryPath}</td>
                <td className="small">{product.brandName ?? "—"}</td>
                <td className="small">{humanise(product.productType)}</td>
                <td className="small">{product.stockUomCode}</td>
                <td className="num">{product.variantCount}</td>
                <td>
                  <Badge
                    tone={
                      product.status === "active"
                        ? "success"
                        : product.status === "draft"
                          ? "neutral"
                          : "danger"
                    }
                  >
                    {humanise(product.status)}
                  </Badge>
                </td>
              </tr>
            ))}
          </Table>
        </QueryState>

        <div className="card-foot">
          <Pager
            total={products.data?.total ?? 0}
            limit={limit}
            offset={offset}
            onChange={setOffset}
          />
        </div>
      </Card>
    </>
  );
}
