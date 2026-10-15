# Komero

Komero tracks what a household has at home and what it needs to buy. Every Member shares the same Inventory and Shopping List.

## People

**Member**:
A person with a Komero account. All Members see and change the same data.
_Avoid_: User, account, household member

**Invite**:
A one-time link a Member sends to someone so they can create their own account and become a Member.

**Activity**:
A record that a Member changed Stock, the Shopping List, or a Product.
_Avoid_: History, log, event

## Inventory

**Product**:
A kind of thing the household keeps at home, named the way the household talks about it ("Maito", "Tiskiaine"), not by brand or package.
_Avoid_: Item, article, grocery

**Barcode**:
A code printed on a package that identifies a Product. A Product can have many Barcodes (e.g. different brands of milk), and each Barcode belongs to one Product.
_Avoid_: EAN, code

**Category**:
A group the household sorts its Products into, such as the fridge, freezer, cupboard, bathroom or cleaning closet. The household defines its own Categories. Each Product belongs to exactly one Category, and all of its Stock is counted there.
_Avoid_: Location, Home Location, storage, place, room

**Stock**:
How many packages of a Product are at home. An opened package counts as one.
_Avoid_: Amount, quantity, count

**Minimum Stock**:
An optional per-Product threshold. Stock at or below it means the Product is Running Low.
_Avoid_: Min level, reorder point

**Running Low**:
A Product whose Stock is at or below its Minimum Stock, or at zero if it has no Minimum Stock.

**Out of Stock**:
A Product whose Stock is zero. It stays in the Inventory so the household can see what is missing.

**Inventory**:
All of the household's Products and their Stock.
_Avoid_: Pantry, storage

**Expiry Date**:
The single date shown for a Product's Stock: the earliest date printed on the packages at home. It is either a Best Before or a Use By date.
_Avoid_: Due date, expiration

**Best Before**:
A date after which a package is probably still fine but should be checked (parasta ennen).

**Use By**:
A date after which a package must not be eaten (viimeinen käyttöpäivä).
_Avoid_: Last use date

**Expiry Kind**:
Whether a Product's packages carry a Best Before date, a Use By date, or no date at all. Products with no Expiry Kind never ask for a date.

**Use**:
Decreasing a Product's Stock because a package was consumed or thrown away.
_Avoid_: Consume, remove, discard

**Needs Attention**:
The Products that are expired, past Best Before, expiring soon, or Running Low, in that order of urgency.
_Avoid_: Alerts, warnings

## Shopping

**Shopping List**:
The one list of things the household needs to buy. Everyone shares it, and it is grouped by Category.
_Avoid_: Grocery list, cart

**Entry**:
One line on the Shopping List, with a quantity. An Entry is either linked to a Product or is a One-off.

**One-off**:
A plain-text Entry that is not linked to any Product, for things the household does not keep track of (e.g. birthday candles).
_Avoid_: Free text, note

**Bag**:
Entries ticked off in the shop, waiting to be put away at home. They do not count toward Stock yet.
_Avoid_: Cart, basket, unpacking tray

**Put Away**:
Moving an Entry from the Bag into Stock at home, which Restocks its Product. A One-off simply disappears.

**Need More**:
Putting a Product on the Shopping List, or increasing its Entry's quantity if it is already there.

**Restock**:
Increasing a Product's Stock because bought packages were put away from the Bag or scanned in.
_Avoid_: Purchase, add
