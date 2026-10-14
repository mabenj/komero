// The Stock rules, in one place. Pure: mutations read a Product, apply a rule
// here and write the result back within the same transaction.

export type StockState = { stock: number };

/** Restock: n packages put away or scanned in. */
export function restock(product: StockState, n: number): StockState {
  return { stock: product.stock + n };
}

/** Use: one package consumed or thrown away. Stock never goes below 0. */
export function use(product: StockState): StockState {
  return { stock: Math.max(0, product.stock - 1) };
}
