# Elixirs — player guide

Player reference for drinking elixirs with **`/item`** and brewing them with **`/crafting brew`** (Witch mixer). Numbers match the live bot (**elixirModule.js**).

---

## Quick actions


| You want to…                    | Do this                                                                                                                                               |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Use** an elixir               | **`/item`** → **character** + elixir from **autocomplete** (quantity **1**). **Town hall**, **community board**, or **threads** under those channels. |
| **Brew** an elixir              | **`/crafting brew`** — **Witch** role, **village town hall** channel.                                                                                 |
| **Pick a bottle**               | **[Choosing what to drink](#choosing-what-to-drink)** (situations) + **[Reference: all elixirs](#reference-all-elixirs)** (full table).               |
| **Look up tier math**           | **[Tier numbers & formulas](#tier-numbers--formulas)**.                                                                                               |
| **Explore / maze / edge cases** | **[Notes by group](#notes-by-group)**.                                                                                                                |


Use **autocomplete** so names match the bot.

---

## How it works

**Buff slot:** Only **one** active **buff** elixir at a time. You can carry **many** bottles; the bot applies **one** buff until it is spent or until a one-shot finishes.

**Two kinds of drink**


| Kind             | Elixirs                                                              | What happens                                                                                                                                                                                                                             |
| ---------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Lasting buff** | Chilly, Spicy, Electro, Bright, Sticky, Mighty, Tough, Sneaky, Hasty | After **`/item`**, the buff stays until the bot **spends** it in a matching activity (travel, combat, gather, loot, etc.). |
| **One-shot**     | Hearty, Fairy Tonic, Enduring, Energizing                            | Effect applies on **`/item`**; the **buff slot is free** again right away. **Hearty** / **Enduring** can leave **extra current** hearts or stamina until you take damage or spend stamina. **Energizing** refills stamina up to **max**. |


**Hearts & stamina (current vs max):** Usually **current** is **at or below** **max**. **Hearty** and **Enduring** add temporary **current** only (**max** unchanged), so you can briefly show **current** above **max** (e.g. **5/3** hearts). **Fairy Tonic**, **Energizing**, and most other heals keep **current** at or below **max**.

**Stamina chunks:** Whole numbers; **5 chunks ≈ 1 wheel** if you think in wheels.

**Tiers:** Bottles are **Basic / Mid / High**. Autocomplete shows the stack, e.g. `Mighty Elixir [Mid]` or `Chilly Elixir [High|m2]` — **`m`** = Fairy **mix-in** hearts on that row; pick the line that matches **your** inventory. For full potency, choose the matching line; the bot may use stacks in **tier order** when several apply.

**Legacy elixirs:** Elixirs created **before** the current tier system — or any inventory row **without** a saved **Mid** or **High** tier — are treated as **Basic** for effects and rolls. New brews from **`/crafting brew`** get a **tier** from the mixer (**Basic**, **Mid**, or **High**).

---

## Choosing what to drink

### Hazards & elements


| You’re dealing with…                                                  | Bottle      |
| --------------------------------------------------------------------- | ----------- |
| Heat, **fire**, hot places, fire-themed threats                       | **Chilly**  |
| **Cold**, **ice**, frost, ice-themed threats                          | **Spicy**   |
| **Lightning**, shock, storm-style danger                              | **Electro** |
| **Water**, wet threats, water-themed enemies                          | **Sticky**  |
| **Blight** (rain, blighted explore, **Gloom Hands**, infection rolls) | **Bright**  |


**Quick map:** **Chilly** — heat/fire · **Spicy** — cold/ice · **Sticky** — water · **Bright** — blight · **Electro** — lightning.

### Combat & travel


| You want…                                             | Bottle                                       |
| ----------------------------------------------------- | -------------------------------------------- |
| Harder hits (**attack**)                              | **Mighty**                                   |
| Less damage taken (**defense**)                       | **Tough**                                    |
| **Stealth** or better **flee** (gather, loot, travel) | **Sneaky**                                   |
| **Faster / shorter travel**                           | **Hasty** (travel often **spends** the buff) |


### Hearts & stamina (one-shot)


| You want…                                                                            | Bottle                                       |
| ------------------------------------------------------------------------------------ | -------------------------------------------- |
| Temporary **extra hearts** above normal (see [tier tables](#tier-numbers--formulas)) | **Hearty**                                   |
| Heal **missing** HP up to a **budget** (never past **max**)                          | **Fairy Tonic**                              |
| Temporary **extra stamina chunks**                                                   | **Enduring**                                 |
| A straight stamina refill                                                            | **Energizing** (+5 / +7 / +9 chunks by tier) |


---

## Reference: all elixirs

Scaling note: most **lasting** buff stats use **Basic** values from the bot, then **Mid ×1.15** and **High ×1.3**, rounded to **0.25**. **Hearty**, **Enduring**, **Energizing**, **Fairy Tonic**, and **Sticky**’s extra-item **ranges** use the **[Tier numbers](#tier-numbers--formulas)** section instead. **Legacy** elixirs (see **How it works**) always use **Basic** scaling from these rules.

### Lasting buffs (stay until spent)


| Elixir      | What it does (Basic)                                                               | Mid / High                                                    | Spent when (buff clears)                                                                                                                   | Also                                                                                      |
| ----------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| **Chilly**  | Fire / heat resistance **×1.5**                                                    | Same                                                          | **Combat**, **HW**, **raid**, **loot** vs fire/heat (element or names)                                                                     | **Explore:** **hot**-quadrant hazard if drunk on expedition                               |
| **Spicy**   | Cold / ice resistance **×1.5**                                                     | Same                                                          | **Combat**, **HW**, **raid**, **loot** vs **Ice** in the name                                                                              | **Explore:** **cold** quadrant                                                            |
| **Electro** | Electric resistance **×1.5**                                                       | Same                                                          | **Combat**, **HW**, **raid**, **loot** vs **Electric** in the name                                                                         | **Explore:** **thunder** quadrant                                                         |
| **Bright**  | Blight resistance **×1.5**                                                         | Same                                                          | **Blight rain** (**travel**, **gather**, **loot**, **HW**, **raid**); **blighted quadrant** move (**explore**); **Gloom Hands** after raid | **Grotto maze:** **+1 / +2 / +3** extra map rings by tier (best **Bright** in party wins) |
| **Sticky**  | Water **×1.5** + **Sticky bonus** (extra **same-item** copies when you earn items) | Water stat scales; extras **1–2** / **3–4** / **4–5** by tier | **Travel**; or **combat** / **HW** / **raid** / **loot** vs **Water** in the name                                                          | **Cold / ice:** use **Spicy**                                                             |
| **Mighty**  | Attack **×1.5**                                                                    | Scales                                                        | **Combat**, **HW**, **raid**, **loot**                                                                                                     | —                                                                                         |
| **Tough**   | Defense **×1.5**                                                                   | Same                                                          | Same                                                                                                                                       | —                                                                                         |
| **Sneaky**  | Stealth **+1**, Flee **+1**                                                        | Both scale                                                    | **Gather**, **loot**, **travel**                                                                                                           | —                                                                                         |
| **Hasty**   | Travel speed **+1**                                                                | Scales                                                        | **Travel**                                                                                                                                 | —                                                                                         |


### One-shots (effect on `/item`; buff slot frees up)


| Elixir          | What it does                                                                                            | Basic / Mid / High                                                      |
| --------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| **Hearty**      | Temporary **extra current hearts**; **max** unchanged. Gain **`ceil(max × M) − max`**, at least **+1**. | **M** = **1.2 / 1.4 / 1.7** ([Tier numbers](#tier-numbers--formulas))   |
| **Fairy Tonic** | Heals **missing** HP: **`min(budget, missing)`**; stops at **max**.                                     | Budget **½ / ¾ / full** max hearts (floored)                            |
| **Enduring**    | Temporary **extra stamina chunks**; **max** unchanged. Same gain pattern as Hearty on stamina.          | **M** = **1.25 / 1.45 / 1.7** ([Tier numbers](#tier-numbers--formulas)) |
| **Energizing**  | Stamina refill only.                                                                                    | **+5 / +7 / +9** chunks (up to **max**)                                 |


---

## Tier numbers & formulas

**Stronger tier → stronger effect.** Resist and combat-style numbers round to the nearest **0.25**. **Legacy** elixirs (see **How it works**) use the **Basic** row in these tables.

### Energizing (fixed)


| Tier  | Chunks |
| ----- | ------ |
| Basic | +5     |
| Mid   | +7     |
| High  | +9     |


### Hearty & Enduring

**Gain:** **`ceil(max × M) − max`** (whole hearts or chunks), at least **+1** when that difference would be **0**.

**Hearty** — tuned so ~**3 max hearts** → about **+1 / +2 / +3** at Basic / Mid / High (`HEARTY_MAX_POOL_MULTIPLIERS` in code):


| Tier  | **M** (hearts) |
| ----- | -------------- |
| Basic | 1.2            |
| Mid   | 1.4            |
| High  | 1.7            |


**Enduring** — tuned so ~**5 stamina chunks** → about **+2 / +3 / +4** (`ENDURING_MAX_POOL_MULTIPLIERS`):


| Tier  | **M** (chunks) |
| ----- | -------------- |
| Basic | 1.25           |
| Mid   | 1.45           |
| High  | 1.7            |


Gain goes to **current** only; **max** stays the same. Same **gain** formula applies to other max pools; these **M** values are what the bot calibrated for typical characters.

### Fairy Tonic (heal budget)

Heal **budget** is a **fraction of max hearts**, floored to whole hearts:


| Tier  | Budget   |
| ----- | -------- |
| Basic | ½ max    |
| Mid   | ¾ max    |
| High  | Full max |


**Actual heal** = **`min(budget, missing hearts)`** — stops at **max** hearts.

### Sticky (extra copies)

Whenever you **earn items** (gathering, `/loot`, travel rewards, exploration, steal, help wanted, similar), you get **extra copies of that same item** (duplicates of what you rolled). **Tier** sets the count: **Basic** **1–2**, **Mid** **3–4**, **High** **4–5** (`STICKY_BONUS_EXTRA_RANGE_BY_LEVEL` in `elixirModule.js`). **Water resistance** is the other half of the bottle; **cold / ice** resistance is **Spicy**.

### Other lasting buffs (Chilly, Spicy, Electro, Bright, Mighty, Tough, Sneaky, Hasty)

**Mid** = Basic **×1.15**, **High** = Basic **×1.3**, then round to **0.25**. **Sneaky** scales **stealth** and **flee** together.

---

## Notes by group

### Resist elixirs (Chilly, Spicy, Electro, Bright, Sticky)

- **Chilly —** **Heat & fire resistance** **×1.5** at Basic on **fireResistance**. Spent in **combat**, **help wanted**, **raid**, **loot** when the encounter is **fire/heat-themed** (fire element or matching names). **Explore:** **hot**-quadrant hazard counter if drunk during the expedition.
- **Spicy —** **Cold & ice** **×1.5** on **coldResistance**. Spent when the monster **name** includes **Ice**. **Explore:** **cold** quadrant.
- **Electro —** **Electric** **×1.5** on **electricResistance**. Spent when the name includes **Electric**. **Explore:** **thunder** quadrant.
- **Bright —** **Blight** **×1.5** on **blightResistance**. Spent on **blight rain** checks (**loot**, **gather**, **travel**, **help wanted**, **raid**), **blighted quadrant** entry (**explore**), or **Gloom Hands** after a raid. **Grotto maze:** **1** / **2** / **3** extra rings of map revealed by tier; party member with **Bright**; **highest tier** wins.
- **Sticky —** **Water** **×1.5** on **waterResistance** plus **Sticky bonus**. Spent on **travel**, or **combat** / **help wanted** / **raid** / **loot** vs **Water** in the name. For **cold / ice**, bring **Spicy**.

### Combat & movement (Mighty, Tough, Sneaky, Hasty)

- **Mighty —** **Attack** boost **×1.5** at Basic (**attackBoost**); Mid/High scale with **×1.15** / **×1.3**. Spent in **combat**, **help wanted**, **raid**, **loot** when used.
- **Tough —** **Defense** **×1.5** at Basic (**defenseBoost**); same scaling. Spent in **combat**, **help wanted**, **raid**, **loot**.
- **Sneaky —** **Stealth** and **flee** **+1** each at Basic; Mid/High on both. Spent on **gather**, **loot**, **travel**.
- **Hasty —** **Travel speed** **+1** at Basic; Mid/High on **speedBoost**. Spent on **travel**.

### One-shots (Hearty, Fairy Tonic, Enduring, Energizing)

- **Hearty —** Gain **`ceil(maxHearts × M) − maxHearts`**, at least **+1**, **M** = **1.2 / 1.4 / 1.7**. **Fairy / Mock Fairy** **mix-in** on the stack can heal **up to max** before the tier bonus; pick the **`|mN`** line that matches your bottle. After **`/item`**, buff slot is **free**; extra **current** above **max** lasts until you **take damage**.
- **Fairy Tonic —** **Fairy / Mock Fairy** extras add to heal **budget** on that stack. After **`/item`**, buff slot **free**; effect is healing only.
- **Enduring —** **`ceil(maxStamina × M) − maxStamina`**, **M** = **1.25 / 1.45 / 1.7**. After **`/item`**, buff slot **free**; **current** can sit above **max** until you spend stamina; the bot may align **current** with **max** when rules call for it ([How it works](#how-it-works)).
- **Energizing —** **+5 / +7 / +9** chunks on **`/item`**, up to **max** stamina. Stamina refill only.

---

## Commands & brewing

### Commands


| Command                | Role                                                                          |
| ---------------------- | ----------------------------------------------------------------------------- |
| **`/item`**            | Use elixirs and items (here: elixirs).                                        |
| **`/crafting brew`**   | **Witch** — elixirs through the mixer (**village town hall**).                |
| **`/crafting recipe`** | Fixed recipes for **other** jobs; **Witch** elixirs use **`/crafting brew`**. |


### Brewing steps (`/crafting brew`)

1. **Witch** runs **`/crafting brew`** → **character** + **elixir** line.
2. Menus: **critter** (matches **effect family**) → **monster part** (often **Chuchu Jelly**; some lines need a colored jelly / element part — the bot tells you).
3. Optional **extras** (parts or same-family critters, up to the limit). **Fairy / Mock Fairy** can add **bonus hearts** on **`/item`** and count strongly for **tier** math.
4. **Cancel** before finish → **keeps** ingredients and stamina. **Finish** → spend ingredients + stamina; bottle gets a **tier** (**mixer score** on the result).

**Chuchu Jelly** (and similar) go in the mixer; **Chuchu Egg** is used **outside** the mixer (e.g. hatch / pet).

### Ingredients

- **Critters** have an **effect family** (chilly, mighty, …) — must match the elixir you’re brewing.
- **Parts** have an **element** — many brews allow **neutral**; some need **fire** (e.g. Chilly), **ice** (Spicy), **electric** (Electro), **undead-adjacent** (Bright), etc.

### Rarity → tier

Ingredients have **rarity** (**1–10**). The mixer blends **critter + part + extras** into a **score** → **Basic (1–3)**, **Mid (4–6)**, or **High (7–10)**. **Rarer** ingredients and **on-theme extras** help. **Fairy / Mock Fairy** count as at least **rarity 5** for that math. **Mix-in** hearts from Fairies are tracked **separately** on the inventory row.

### Checklist

- **One** active buff elixir at a time; many bottles in inventory is fine.
- **Quantity 1** per **`/item`** for elixirs.
- Use **critters** and **parts** from the mixer **menus** for the recipe you are brewing.

---

## See also

- Mixer design: **`docs/elixir-mixing/README.md`**

