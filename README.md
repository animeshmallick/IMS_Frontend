# IMS — Frontend

React web client for the IMS backend (`../backend`).

| Layer      | Choice                        |
| ---------- | ----------------------------- |
| Build      | Vite 6                        |
| UI         | React 19                      |
| Routing    | React Router 7                |
| Data       | TanStack Query 5              |
| Auth       | better-auth React client      |

## Getting started

Node 20.11+ required (verified against v24.20.0, npm 11.19.0).

```bash
npm install
cp .env.example .env    # leave VITE_API_BASE_URL empty for local development
npm run dev             # http://localhost:5173
```

Run the backend on port 4000 at the same time. Vite proxies `/api` to it, so the
browser sees a single origin.

## Why the dev proxy matters

Session cookies are httpOnly and SameSite=Lax. Pointing the client straight at
`http://localhost:4000` makes every request cross-site, so the cookie is never
sent and every call fails as unauthenticated with no useful error. The proxy in
`vite.config.ts` removes that whole class of problem, and matches production,
where the app and API sit behind one hostname.

## Layout

```
src/
  main.tsx              entry point
  App.tsx               query client, router, session gate
  lib/
    api.ts              typed fetch client, mirrors the backend envelope
    auth.ts             better-auth browser client
    session.tsx         GET /me -> permissions and locations, via context
    permissions.ts      permission codes mirrored from the backend
    types.ts            API response shapes
    format.ts           money, quantity, date and status formatting
    hooks.ts            query/mutation wrappers over TanStack Query
  components/
    Shell.tsx           navigation, working-location switcher, sign out
    Guard.tsx           hides UI the user cannot use
    RequirePermission.tsx  route-level equivalent
    ui.tsx              cards, tables, modals, banners, pager
    VariantPicker.tsx   scanner-first SKU lookup, shared by every document
  pages/
    Dashboard.tsx       expiring stock, reorders, goods in transit, takings
    catalog/            products, product detail, new product, categories
    partners/           suppliers, customers
    purchasing/         purchase orders, goods receipts
    transfers/          warehouse-to-store movement, both legs
    stock/              on hand, ledger, adjustments, counts
    counter/            till, bills, receipt, returns, cash shifts
    reports/            sales, margin, best sellers, purchases
    insights/           supplier scorecard, staff, shrinkage, dead stock,
                        margin erosion, stock accuracy, busy hours, and the
                        replenishment plan with auto-drafted purchase orders
    admin/              staff, roles, locations, audit trail, system health
```

## Two rules

**Permission checks here are ergonomics, not security.** `Guard` and `can()`
decide what to show. Every one of those permissions is enforced again on the
server, which is the only check that counts — a hidden button is one HTTP client
away from being pressed.

**Reuse an idempotency key across retries of one intent.** `newIdempotencyKey()`
is called once when the user commits to an action, and the same value is sent on
every retry of it. Generating a fresh key per attempt defeats the entire
mechanism and is how a delivery gets booked twice. `useApiMutation({ idempotent: true })`
holds the key in a ref until the mutation succeeds, which is what makes this the
default rather than something each screen has to remember.

## Money and quantities are strings

Every amount and quantity from the API is a `string`, because the column behind
it is Postgres `numeric`. The helpers in `format.ts` format for display and
nothing else — the original string is what gets sent back on a write. Parsing to
a JavaScript number to "tidy it up" reintroduces exactly the float error the
backend goes to some length to avoid, and it resurfaces as a balance of
0.30000000000000004.

## Insights ask nothing of staff

Every figure on the Insights and replenishment screens is derived from documents
staff already create. No screen in those modules has a field whose only purpose
is a report — which is why the reporting can be this detailed without anyone
noticing the cost.

The one place this shows in the UI is the replenishment plan: it labels each
reorder point `computed` or `set by hand`, so it is always obvious whether a
number came from real sales or from someone typing it once and forgetting.

## The counter

The till is the one screen used under time pressure with a queue waiting, so it
is laid out and behaves differently from the rest:

- **Scanner-first.** The search box holds focus and an exact barcode match is
  added on Enter without a menu appearing.
- **Loose goods prompt for a weight** in the product's own stock unit; discrete
  items skip that entirely, which is what keeps scanning fast.
- **The totals panel is pinned**, so the amount to ask for never scrolls away.
- **Batch and expiry are shown on each line**, because the cashier is physically
  handing that lot over and the expiry is the customer's question.
- **Receipts print** to a 76 mm roll — everything else is hidden at print time,
  so "Print receipt" produces a receipt rather than a screenshot of an admin
  page.
