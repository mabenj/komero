import { afterEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import { type MemberSession, newKomero, signUp } from "./test.helpers";

const MAITO_VALIO = "6408430000258";
const SHAMPOO = "3600523614523";
const TISKIAINE = "6414100012345";
const NO_SUGGESTION = { name: null, expiryKind: null };

afterEach(() => vi.unstubAllGlobals());

/** Open Food Facts answering every lookup with this product. */
function openFoodFactsFinds(product: object) {
  const fetchMock = vi.fn<typeof fetch>(async () =>
    Response.json({ code: MAITO_VALIO, result: { id: "product_found" }, product, status: "success" }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function locationId(member: MemberSession, name: string) {
  const inventory = await member.query(api.inventory.get, {});
  return inventory.find((location) => location.name === name)!._id;
}

describe("Open Food Facts suggestions for an unknown barcode", () => {
  test("a food match suggests its name and Best Before", async () => {
    const fetchMock = openFoodFactsFinds({
      product_name: "Eila lactose free milk drink",
      product_name_fi: "Eila laktoositon kevytmaitojuoma",
      product_type: "food",
    });
    const anna = await signUp(newKomero(), "anna@example.com");

    const suggestion = await anna.action(api.barcodes.lookup, { code: MAITO_VALIO });

    expect(suggestion).toEqual({ name: "Eila laktoositon kevytmaitojuoma", expiryKind: "bestBefore" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain(`/api/v3/product/${MAITO_VALIO}`);
    expect(new Headers(init?.headers).get("User-Agent")).toBe("Komero/1.0 (https://github.com/mabenj/komero)");
  });

  test("a non-food match (a shampoo) suggests its name and no Expiry Kind", async () => {
    openFoodFactsFinds({ product_name: "Elvital Shampoo", product_type: "beauty" });
    const anna = await signUp(newKomero(), "anna@example.com");

    expect(await anna.action(api.barcodes.lookup, { code: SHAMPOO })).toEqual({
      name: "Elvital Shampoo",
      expiryKind: null,
    });
  });

  test("a barcode Open Food Facts doesn't know gives no suggestion", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ result: { id: "product_not_found" }, status: "failure", errors: [{}] }, { status: 404 }),
      ),
    );
    const anna = await signUp(newKomero(), "anna@example.com");

    expect(await anna.action(api.barcodes.lookup, { code: TISKIAINE })).toEqual(NO_SUGGESTION);
  });

  test.each([
    ["is rate-limited", async () => new Response("Too Many Requests", { status: 429 })],
    ["answers with an HTML error page", async () => new Response("<html>500</html>", { status: 500 })],
    ["answers 200 with something that isn't JSON", async () => new Response("<html>maintenance</html>")],
    ["can't be reached", async () => Promise.reject(new TypeError("fetch failed"))],
  ])("when Open Food Facts %s, there is no suggestion and no error", async (_, respond) => {
    vi.stubGlobal("fetch", vi.fn(respond));
    const anna = await signUp(newKomero(), "anna@example.com");

    expect(await anna.action(api.barcodes.lookup, { code: TISKIAINE })).toEqual(NO_SUGGESTION);
  });

  test("a code that isn't a product barcode isn't looked up at all", async () => {
    const fetchMock = openFoodFactsFinds({ product_name: "Maito", product_type: "food" });
    const anna = await signUp(newKomero(), "anna@example.com");

    expect(await anna.action(api.barcodes.lookup, { code: "../../admin" })).toEqual(NO_SUGGESTION);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("a New Product from a food suggestion starts with Best Before, so the Add scan asks for its date", async () => {
    openFoodFactsFinds({ product_name_fi: "Eila laktoositon kevytmaitojuoma", product_type: "food" });
    const anna = await signUp(newKomero(), "anna@example.com");
    const suggestion = await anna.action(api.barcodes.lookup, { code: MAITO_VALIO });

    const linked = await anna.mutation(api.barcodes.linkNew, {
      code: MAITO_VALIO,
      name: "Maito",
      locationId: await locationId(anna, "Jääkaappi"),
      mode: "add",
      expiryKind: suggestion.expiryKind,
    });

    expect(linked).toMatchObject({ name: "Maito", action: "restock", to: 1, expiryKind: "bestBefore" });
    expect(await anna.query(api.products.get, { productId: linked.productId })).toMatchObject({
      expiryKind: "bestBefore",
    });
  });

  test("with no suggestion, the typed name makes a Product with no Expiry Kind", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 404 })));
    const anna = await signUp(newKomero(), "anna@example.com");
    const suggestion = await anna.action(api.barcodes.lookup, { code: TISKIAINE });

    const linked = await anna.mutation(api.barcodes.linkNew, {
      code: TISKIAINE,
      name: "Tiskiaine",
      locationId: await locationId(anna, "Siivouskomero"),
      mode: "add",
      expiryKind: suggestion.expiryKind,
    });

    expect(linked).toMatchObject({ name: "Tiskiaine", to: 1, expiryKind: null });
    expect(await anna.query(api.products.get, { productId: linked.productId })).toMatchObject({ expiryKind: null });
  });

  test("a food suggestion linked to an existing Product by name leaves that Product's Expiry Kind alone", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");
    const maito = await anna.mutation(api.products.create, {
      name: "Maito",
      locationId: await locationId(anna, "Jääkaappi"),
    });

    await anna.mutation(api.barcodes.linkNew, {
      code: MAITO_VALIO,
      name: "maito",
      locationId: await locationId(anna, "Jääkaappi"),
      mode: "add",
      expiryKind: "bestBefore",
    });

    expect(await anna.query(api.products.get, { productId: maito })).toMatchObject({ stock: 2, expiryKind: null });
  });

  test("a visitor who isn't signed in can't look up barcodes", async () => {
    const fetchMock = openFoodFactsFinds({ product_name: "Maito", product_type: "food" });

    await expect(newKomero().action(api.barcodes.lookup, { code: MAITO_VALIO })).rejects.toThrow(/NOT_SIGNED_IN/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
