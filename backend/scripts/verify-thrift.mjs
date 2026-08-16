// End-to-end check of the thrift marketplace against the real database.
//
// Creates three throwaway users and drives the real Express app over HTTP with
// real session cookies. Everything it creates is deleted in the finally block,
// including on failure.
//
//   npm run verify:thrift
import { neon } from "@neondatabase/serverless";
import { createApp } from "../dist/app.js";
import { signSessionToken } from "../dist/services/auth.js";

const sql = neon(process.env.DATABASE_URL);
const TAG = "__verify_thrift";

let pass = 0;
let fail = 0;
const failures = [];

function check(name, ok, detail = "") {
  if (ok) {
    pass++;
    console.log(`  ok   ${name}`);
  } else {
    fail++;
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function main() {
  const app = createApp();
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}/api`;

  const made = { users: [], clothes: [] };

  async function mkUser(label) {
    const [row] = await sql`
      INSERT INTO users (email, name)
      VALUES (${`${TAG}_${label}_${Date.now()}@example.invalid`}, ${`Verify ${label}`})
      RETURNING id, name, email`;
    made.users.push(row.id);
    const token = await signSessionToken(row.id);
    return { ...row, cookie: `tryunex_session=${token}` };
  }

  async function mkCloth(user, name, category = "top") {
    const [row] = await sql`
      INSERT INTO clothes (user_id, name, category, image_url, style_tag)
      VALUES (${user.id}, ${name}, ${category},
              ${`https://example.invalid/clothes/${user.id}/x.jpg`}, 'casual')
      RETURNING id`;
    made.clothes.push(row.id);
    return row.id;
  }

  async function call(user, method, path, body) {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        cookie: user.cookie,
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* non-JSON body */
    }
    return { status: res.status, body: json ?? text };
  }

  try {
    const seller = await mkUser("seller");
    const buyer = await mkUser("buyer");
    const other = await mkUser("other");
    const clothId = await mkCloth(seller, "Verify Denim Jacket", "outerwear");
    const clothId2 = await mkCloth(seller, "Verify Tee", "top");

    console.log("\n— listing lifecycle —");
    const created = await call(seller, "POST", "/thrift/listings", {
      clothId,
      title: "Verify Denim Jacket",
      pricePaise: 49900,
      size: "M",
      condition: "gently_used",
      deliveryPreference: "either",
      city: "Pune",
      status: "active",
    });
    check("seller creates a listing", created.status === 201, `status ${created.status}`);
    const listingId = created.body?.listing?.id;

    check(
      "image and category come from the cloth, not the request",
      created.body?.listing?.imageUrl?.includes(seller.id) &&
        created.body?.listing?.category === "outerwear",
      JSON.stringify(created.body?.listing?.category),
    );

    const dup = await call(seller, "POST", "/thrift/listings", {
      clothId,
      title: "Second listing",
      pricePaise: 10000,
      size: "M",
      condition: "used",
      deliveryPreference: "pickup",
    });
    check("same piece cannot be listed twice", dup.status === 409, `status ${dup.status}`);

    const notMine = await call(buyer, "POST", "/thrift/listings", {
      clothId: clothId2,
      title: "Not mine",
      pricePaise: 10000,
      size: "S",
      condition: "used",
      deliveryPreference: "pickup",
    });
    check("cannot list someone else's piece", notMine.status === 403, `status ${notMine.status}`);

    console.log("\n— browsing —");
    const buyerBrowse = await call(buyer, "GET", "/thrift/listings");
    check(
      "buyer sees the active listing",
      buyerBrowse.body?.listings?.some((l) => l.id === listingId),
    );
    const sellerBrowse = await call(seller, "GET", "/thrift/listings");
    check(
      "seller does not see their own listing while browsing",
      !sellerBrowse.body?.listings?.some((l) => l.id === listingId),
    );
    const sellerMine = await call(seller, "GET", "/thrift/listings?mine=true");
    check(
      "seller sees it under the My listings filter",
      sellerMine.body?.listings?.some((l) => l.id === listingId),
    );

    const found = buyerBrowse.body.listings.find((l) => l.id === listingId);
    check(
      "no seller email anywhere in the payload",
      !JSON.stringify(buyerBrowse.body).includes("@example.invalid"),
    );
    check("seller name is exposed, not identity", found?.sellerName === "Verify seller");

    const filtered = await call(buyer, "GET", "/thrift/listings?category=outerwear&condition=gently_used&maxPaise=50000");
    check("filters match", filtered.body?.listings?.some((l) => l.id === listingId));
    const excluded = await call(buyer, "GET", "/thrift/listings?maxPaise=1000");
    check("price filter excludes", !excluded.body?.listings?.some((l) => l.id === listingId));
    const searched = await call(buyer, "GET", "/thrift/listings?q=denim");
    check("search matches the title", searched.body?.listings?.some((l) => l.id === listingId));

    console.log("\n— saving —");
    await call(buyer, "POST", `/thrift/listings/${listingId}/save`);
    const saved = await call(buyer, "GET", "/thrift/saved");
    check("save then list", saved.body?.listings?.some((l) => l.id === listingId));
    await call(buyer, "DELETE", `/thrift/listings/${listingId}/save`);
    const unsaved = await call(buyer, "GET", "/thrift/saved");
    check("unsave removes it", !unsaved.body?.listings?.some((l) => l.id === listingId));

    console.log("\n— messaging —");
    const ownConv = await call(seller, "POST", `/thrift/listings/${listingId}/conversation`);
    check("seller cannot message their own listing", ownConv.status === 400, `status ${ownConv.status}`);

    const conv1 = await call(buyer, "POST", `/thrift/listings/${listingId}/conversation`);
    const convId = conv1.body?.conversationId;
    check("buyer opens a conversation", conv1.status === 201 && Boolean(convId));
    const conv2 = await call(buyer, "POST", `/thrift/listings/${listingId}/conversation`);
    check(
      "second attempt reuses the same conversation",
      conv2.body?.conversationId === convId && conv2.body?.created === false,
    );

    const sent = await call(buyer, "POST", `/thrift/messages/${convId}`, {
      body: "Hi, is this still available?",
    });
    check("buyer sends a message", sent.status === 201, `status ${sent.status}`);

    const withPhone = await call(buyer, "POST", `/thrift/messages/${convId}`, {
      body: "call me on 98765 43210",
    });
    check("phone numbers are rejected", withPhone.status === 400, `status ${withPhone.status}`);
    const withEmail = await call(buyer, "POST", `/thrift/messages/${convId}`, {
      body: "mail me at someone@example.com",
    });
    check("email addresses are rejected", withEmail.status === 400, `status ${withEmail.status}`);

    const intruder = await call(other, "GET", `/thrift/messages/${convId}`);
    check("a third party cannot read the thread", intruder.status === 403, `status ${intruder.status}`);
    const intruderSend = await call(other, "POST", `/thrift/messages/${convId}`, { body: "hello" });
    check("a third party cannot post", intruderSend.status === 403, `status ${intruderSend.status}`);

    const sellerView = await call(seller, "GET", `/thrift/messages/${convId}`);
    check("seller reads the thread", sellerView.status === 200);
    check("mine flag is per-reader", sellerView.body?.messages?.[0]?.mine === false);

    const inbox = await call(seller, "GET", "/thrift/messages");
    check("unread counted for the seller", inbox.body?.conversations?.[0]?.unread >= 1);
    await call(seller, "POST", `/thrift/messages/${convId}/read`);
    const inbox2 = await call(seller, "GET", "/thrift/messages");
    check("read clears the unread count", inbox2.body?.conversations?.[0]?.unread === 0);

    console.log("\n— try-on access —");
    const listedRows = await sql`
      SELECT 1 FROM thrift_listings WHERE source_cloth_id = ${clothId} AND status = 'active'`;
    check("active listing grants try-on lookup", listedRows.length === 1);

    console.log("\n— sold closes the thread —");
    const soldRes = await call(seller, "POST", `/thrift/listings/${listingId}/mark-sold`);
    check("seller marks sold", soldRes.status === 200 && soldRes.body?.listing?.status === "sold");

    const afterSold = await call(buyer, "GET", "/thrift/listings");
    check(
      "sold listing leaves the marketplace",
      !afterSold.body?.listings?.some((l) => l.id === listingId),
    );

    const blocked = await call(buyer, "POST", `/thrift/messages/${convId}`, { body: "still there?" });
    check("composer is closed after sale", blocked.status === 409, `status ${blocked.status}`);

    const history = await call(buyer, "GET", `/thrift/messages/${convId}`);
    check("history is still readable", history.status === 200 && history.body?.messages?.length >= 1);
    check("closed reason is the sold copy", history.body?.conversation?.closedReason?.includes("sold"));

    const relist = await call(seller, "POST", `/thrift/listings/${listingId}/activate`, {});
    check("re-listing a sold piece needs confirmation", relist.status === 409, `status ${relist.status}`);
    const relistOk = await call(seller, "POST", `/thrift/listings/${listingId}/activate`, {
      confirmRelist: true,
    });
    check("confirmed re-list succeeds", relistOk.status === 200 && relistOk.body?.listing?.status === "active");

    console.log("\n— pause and remove —");
    await call(seller, "POST", `/thrift/listings/${listingId}/pause`);
    const paused = await call(buyer, "GET", `/thrift/listings/${listingId}`);
    check("paused listing is hidden from browse",
      !(await call(buyer, "GET", "/thrift/listings")).body?.listings?.some((l) => l.id === listingId));
    check("paused listing is still readable by link", paused.status === 200);

    const notOwner = await call(buyer, "POST", `/thrift/listings/${listingId}/pause`);
    check("only the seller can pause", notOwner.status === 403, `status ${notOwner.status}`);

    console.log("\n— reporting and blocking —");
    const report = await call(buyer, "POST", `/thrift/listings/${listingId}/report`, {
      reason: "not_as_described",
      note: "verify",
    });
    check("listing report accepted", report.status === 200);
    const stillThere = await sql`SELECT status FROM thrift_listings WHERE id = ${listingId}`;
    check("one report does not change the listing", stillThere[0].status === "paused");

    const convReport = await call(buyer, "POST", `/thrift/messages/${convId}/report`, {
      reason: "spam",
    });
    check("conversation report accepted", convReport.status === 200);

    await call(seller, "POST", `/thrift/listings/${listingId}/activate`, { confirmRelist: true });
    const blockRes = await call(buyer, "POST", `/thrift/users/${seller.id}/block`);
    check("block accepted", blockRes.status === 200);

    const afterBlock = await call(buyer, "GET", "/thrift/listings");
    check(
      "blocked seller's listings disappear for the buyer",
      !afterBlock.body?.listings?.some((l) => l.id === listingId),
    );
    const blockedDetail = await call(buyer, "GET", `/thrift/listings/${listingId}`);
    check("blocked seller's listing 404s", blockedDetail.status === 404, `status ${blockedDetail.status}`);
    const blockedSend = await call(buyer, "POST", `/thrift/messages/${convId}`, { body: "hi" });
    check("blocked buyer cannot post", blockedSend.status === 403, `status ${blockedSend.status}`);

    const selfBlock = await call(buyer, "POST", `/thrift/users/${buyer.id}/block`);
    check("cannot block yourself", selfBlock.status === 400, `status ${selfBlock.status}`);

    await call(buyer, "DELETE", `/thrift/users/${seller.id}/block`);
    const afterUnblock = await call(buyer, "GET", "/thrift/listings");
    check(
      "unblocking restores visibility",
      afterUnblock.body?.listings?.some((l) => l.id === listingId),
    );

    console.log("\n— wardrobe integration —");
    const detail = await call(seller, "GET", `/clothes/${clothId}`);
    check("cloth detail reports the listing", detail.body?.listing?.id === listingId);
    check("piece stays in the wardrobe", detail.body?.cloth?.id === clothId);
    const unlisted = await call(seller, "GET", `/clothes/${clothId2}`);
    check("unlisted piece reports no listing", unlisted.body?.listing === null);

    const removed = await call(seller, "DELETE", `/thrift/listings/${listingId}`);
    check("soft remove keeps the row", removed.status === 200);
    const rows = await sql`SELECT status FROM thrift_listings WHERE id = ${listingId}`;
    check("row survives removal", rows.length === 1 && rows[0].status === "removed");
    const relistable = await call(seller, "POST", "/thrift/listings", {
      clothId,
      title: "Relisted",
      pricePaise: 20000,
      size: "M",
      condition: "used",
      deliveryPreference: "pickup",
    });
    check("piece can be listed again after removal", relistable.status === 201, `status ${relistable.status}`);
  } finally {
    // Cascades clear listings, saves, conversations, messages, reports, blocks.
    for (const id of made.users) await sql`DELETE FROM users WHERE id = ${id}`;
    server.close();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) {
    console.log("\nFailures:");
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
