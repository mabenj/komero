/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as activities from "../activities.js";
import type * as auth from "../auth.js";
import type * as barcodes from "../barcodes.js";
import type * as categories from "../categories.js";
import type * as crons from "../crons.js";
import type * as frequentlyBought from "../frequentlyBought.js";
import type * as http from "../http.js";
import type * as inventory from "../inventory.js";
import type * as invites from "../invites.js";
import type * as locations from "../locations.js";
import type * as members from "../members.js";
import type * as newProduct from "../newProduct.js";
import type * as productNames from "../productNames.js";
import type * as products from "../products.js";
import type * as scanModes from "../scanModes.js";
import type * as shoppingList from "../shoppingList.js";
import type * as standIns from "../standIns.js";
import type * as stock from "../stock.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  activities: typeof activities;
  auth: typeof auth;
  barcodes: typeof barcodes;
  categories: typeof categories;
  crons: typeof crons;
  frequentlyBought: typeof frequentlyBought;
  http: typeof http;
  inventory: typeof inventory;
  invites: typeof invites;
  locations: typeof locations;
  members: typeof members;
  newProduct: typeof newProduct;
  productNames: typeof productNames;
  products: typeof products;
  scanModes: typeof scanModes;
  shoppingList: typeof shoppingList;
  standIns: typeof standIns;
  stock: typeof stock;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
