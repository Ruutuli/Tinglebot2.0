# Elixirs — player guide

Quick reference for **`/item`** (drink) and **`/crafting brew`** (Witch mixer). Numbers match **`elixirModule.js`** (live bot).

---

## Start here

| You want to… | Do this |
| --- | --- |
| **Use** an elixir | **`/item`** → your **character** + elixir from **autocomplete** (quantity **1**). Use it in **town hall**, **community board**, or **threads** under those channels. |
| **Brew** an elixir | **`/crafting brew`** — **Witch** role, **village town hall** channel. |
| **Know which bottle to bring** | See **Pick an elixir for the situation** (below). |
| **See numbers by tier** | See **Tiers: Basic, Mid, High** (below). |

Use **autocomplete** for names so they match the bot.

---

## The big rules

1. **Only one elixir buff on your character at a time.** You can carry **many bottles** in inventory; they don’t stack as multiple buffs.
2. **Buff elixirs don’t time out in real life.** After **`/item`**, the buff **stays** until the bot **spends** it in the right activity (travel, combat, gather, loot, etc.). Another buff elixir is blocked while one is active (see in-bot messages).
3. **Hearty**, **Fairy Tonic**, and **Enduring** resolve on **`/item`** without a **timed** buff (Hearty/Enduring can leave **extra current** until spent — see **Reminder**). **Energizing** only **refills stamina** (up to max); it does **not** grant an ongoing elixir buff. **Mighty**, **Chilly**, and most **other** elixirs set a **lasting buff** until spent.

### Reminder: current vs max (hearts and stamina)

For almost everything in play, **current** cannot go **above** **max**. If you’re **3/3** hearts, you normally **cannot** end up **5/3**; same idea for stamina (**current ≤ max**).

**Hearty** and **Enduring** are **special cases**. They **only** add to **current** — they **never** raise **max**. That’s why they can show numbers like **5/3** or **8/5** until you take damage or spend stamina down. **Fairy Tonic**, **Energizing** refills, and most other effects follow the usual cap (**current** stays at or below **max**).

---

## Pick an elixir for the situation

### Weather & hazards

| Bottle | Bring it when… |
| --- | --- |
| **Chilly** | Heat, **fire**, hot places, fire-themed threats |
| **Spicy** | **Cold**, **ice**, frost, ice-themed threats |
| **Electro** | **Lightning**, shock, storm-style danger |
| **Bright** | **Blight** weather / infection-style conditions — and in **grotto maze** trials (**explore**), extra **fog** lifted on the maze map (**1 / 2 / 3** section rings by tier) while the buff is active |
| **Sticky** | **Water** resistance (water-type monsters & water-themed danger) + **Sticky bonus**: extra copies of the same item whenever you get items — **higher tier = better odds & higher cap**. *Cold/ice → **Spicy**, not Sticky.* |

**Remember:** **Chilly** = fire/heat · **Sticky** = water · **Bright** = blight — three different bottles.

### Combat & travel

| Bottle | Bring it when… |
| --- | --- |
| **Mighty** | You need to hit harder (**attack**) |
| **Tough** | You need to take less damage (**defense**) |
| **Sneaky** | You want **stealth** or better **flee** (gather, loot, travel encounters) |
| **Hasty** | You want **shorter travel** (speed — travel often **spends** the buff) |

### Hearts & stamina

| Bottle | What it does |
| --- | --- |
| **Hearty** | **Basic ×1.2 / Mid ×1.4 / High ×1.7** of your **max hearts** — temporary **extra current** only (**max** unchanged; see **Reminder** above). **`m`** Fairy mix-in heals **up to max**; the **tier** bonus can go past max. |
| **Fairy Tonic** | Heals **missing** HP only (never above your real max). Heal **budget** by tier: **½ / ¾ / full max hearts** (floored whole hearts), then **`min(budget, missing)`**. **Fairy / Mock Fairy** extras add bonus heal. |
| **Enduring** | **Basic ×1.25 / Mid ×1.45 / High ×1.7** of your **max stamina (chunks)** — extra **current** chunks only (**max** unchanged; see **Reminder** above). Formula below; tuned for **~5** chunks. One-shot on **`/item`**. |
| **Energizing** | **+5 / +7 / +9** stamina chunks restored on **`/item`** by tier (capped at your **max** stamina; see **Reminder** above). |

**Stamina chunks:** whole numbers; **5 chunks ≈ 1 wheel** if you think in wheels.

---

## Tiers: Basic, Mid, High

Bottles are **Basic / Mid / High**. Autocomplete shows which stack you’re using, e.g. `Mighty Elixir [Mid]` or `Chilly Elixir [High|m2]` (**`m`** = Fairy **mix-in** hearts on that stack — pick the line that matches **your** inventory row). If you care about potency, **pick the exact line**; otherwise the bot may use **lower tiers first**.

**Stronger tier → stronger effect.** Whole numbers for hearts and stamina chunks; resist and combat-style buff stats use the nearest **0.25** (e.g. **×1.75**).

### Energizing (fixed chunk ladder)

| Tier | Stamina refill (chunks) |
| --- | ---: |
| Basic | +5 |
| Mid | +7 |
| High | +9 |

### Hearty & Enduring — **× max pool** (separate tier multipliers)

**Gain:** **`ceil(max × M) − max`** (whole hearts/chunks), at least **+1** if that difference would be **0**.

**Hearty** (`HEARTY_MAX_POOL_MULTIPLIERS` in code) — tuned so **~3 max hearts** gives about **+1 / +2 / +3** at Basic / Mid / High:

| Tier | **M** (hearts) |
| --- | ---: |
| Basic | 1.2 |
| Mid | 1.4 |
| High | 1.7 |

**Enduring** (`ENDURING_MAX_POOL_MULTIPLIERS`) — tuned so **~5 max stamina chunks** gives about **+2 / +3 / +4**:

| Tier | **M** (chunks) |
| --- | ---: |
| Basic | 1.25 |
| Mid | 1.45 |
| High | 1.7 |

- **Hearty / Enduring:** gain goes to **current** only; **max** never increases. These two elixirs are the usual way **current** can sit **above** **max** for a while (see **Reminder** at the top of this guide).

Other max pools still scale with the same formula; only these baselines were used for calibration.

### Fairy Tonic (heal budget by tier)

Heal **budget** (how much you *could* heal toward missing HP) is a **fraction of max hearts**, **floored** to whole hearts:

| Tier | Budget (of max hearts) |
| --- | ---: |
| Basic | ½ |
| Mid | ¾ |
| High | 1× (full max) |

**Actual heal** = **`min(budget, missing hearts)`** — you never overheal above max.

### Sticky Elixir — **plus** extra items (not only loot)

**Sticky bonus:** whenever an action **gives you items** — gathering, `/loot`, travel rewards, exploration, steal, help wanted, and similar — you **always** get **extra copies of that same item** (not a random second item). **Tier** sets a **random range** for how many extras: **Basic** **1–2**, **Mid** **3–4**, **High** **4–5** (`STICKY_BONUS_EXTRA_RANGE_BY_LEVEL` in `elixirModule.js`). **Water resistance** is separate — for **cold / ice**, drink **Spicy**, not Sticky.

### Other buff elixirs (Chilly, Spicy, Electro, Bright, Mighty, Tough, Sneaky, Hasty)

**Mid** multiplies the Basic stat by **×1.15**, **High** by **×1.3**, then rounds to **0.25**. **Sneaky** boosts **stealth** and **flee**.

---

## Each elixir in detail

Numbers and formulas match **`elixirModule.js`** and **`/item`** (Hearty, Fairy Tonic, and Enduring use **`/item`**’s special path: they **do not** leave an active elixir buff after drinking; everything else that uses `applyElixirBuff` does).

**Tier scaling** for most combat/resist elixirs: **Basic** uses the catalog value below; **Mid** = Basic **×1.15**; **High** = Basic **×1.3**, rounded to the nearest **0.25**. **Energizing**, **Hearty**, **Enduring**, **Fairy Tonic**, and **Sticky**’s extra-item range use the tables in **Tiers** (above).

---

### Chilly Elixir

- **Effect:** **Heat & fire resistance** — multiplies how well you resist fire/heat (e.g. **×1.5** at Basic on the **fireResistance** stat; Mid/High scale as above).
- **When it’s “spent”:** The buff clears when you fight in **combat**, **help wanted**, **raid**, or **loot** and the encounter is **fire/heat-themed** (e.g. monster element **fire**, or name patterns match fire/heat).
- **Exploration:** Counts as the **hot**-quadrant hazard counter if you drink it during an expedition (explore flow).

---

### Spicy Elixir

- **Effect:** **Cold & ice resistance** — **×1.5** at Basic on **coldResistance**; Mid/High scale the same way as other resist elixirs.
- **When it’s spent:** **Combat**, **help wanted**, **raid**, or **loot** when the monster name includes **Ice** (ice-themed enemies).
- **Exploration:** **Cold**-quadrant hazard counter if used during explore.

---

### Electro Elixir

- **Effect:** **Electric resistance** — **×1.5** at Basic on **electricResistance**; Mid/High scale the same way.
- **When it’s spent:** **Combat**, **help wanted**, **raid**, or **loot** when the monster name includes **Electric**.
- **Exploration:** **Thunder**-quadrant hazard counter if used during explore.

---

### Bright Elixir

- **Effect:** **Blight resistance** — **×1** at Basic on **blightResistance**; Mid/High scale the same way (not the same base number as **×1.5** resists).
- **Grotto mazes:** In **grotto maze** trials during **explore**, **Bright** lifts extra **fog-of-war** on the maze image: **Basic** **1** extra ring of map sections, **Mid** **2**, **High** **3** (whoever in the party has the active **Bright** buff — strongest tier wins). Drink before or during the maze so your buff is active when the map renders.
- **When it’s spent:** **Only** when **blight-style weather** is active in context (**blight rain** in the bot’s checks). Then it can clear on **loot**, **gather**, **travel**, **help wanted**, or **raid**. If there’s no blight context, it **does not** auto-consume from those activities alone.

---

### Sticky Elixir

- **Effect:** Two parts: **water resistance** (**×1.5** at Basic on **waterResistance**, scaled at Mid/High like other resists) **and** the **Sticky bonus** — whenever you **earn items** (gathering, `/loot`, travel rewards, exploration, steal, help wanted, etc.), you roll **extra copies of the same item** (not a random second item). **Tier** sets the range: **Basic** **1–2**, **Mid** **3–4**, **High** **4–5** extras.
- **When it’s spent:** **Travel** (buff can clear when travel uses it), **or** **combat** / **help wanted** / **raid** / **loot** against a monster whose **name** includes **Water** (water-themed enemies). **Cold/ice** threats use **Spicy**, not Sticky.

---

### Mighty Elixir

- **Effect:** **Attack** — adds to your attack stat (e.g. **+1.5** at Basic as **attackBoost**; Mid/High scale with **×1.15** / **×1.3** on that bonus, rounded to **0.25**).
- **When it’s spent:** **Combat**, **help wanted**, **raid**, or **loot** when the game uses that buff.

---

### Tough Elixir

- **Effect:** **Defense** — same scaling pattern as Mighty (**+1.5** at Basic as **defenseBoost**); Mid/High use **×1.15** / **×1.3**.
- **When it’s spent:** **Combat**, **help wanted**, **raid**, or **loot**.

---

### Sneaky Elixir

- **Effect:** **Stealth** and **flee** — **+1** each at Basic; Mid/High scale both stats with **×1.15** / **×1.3** (rounded to **0.25**).
- **When it’s spent:** **Gather**, **loot**, or **travel** (stealth/flee relevant to those flows).

---

### Hasty Elixir

- **Effect:** **Travel speed** — **+1** at Basic; Mid/High scale with **×1.15** / **×1.3** on **speedBoost**.
- **When it’s spent:** **Travel** (when travel consumes the buff).

---

### Hearty Elixir

- **Effect:** Adds **temporary extra current hearts** only — **max** does not change. Gain is **`ceil(maxHearts × M) − maxHearts`**, at least **+1**, with **M** = **1.2 / 1.4 / 1.7** for Basic / Mid / High (see **Tiers**). **Fairy / Mock Fairy** mix-in on the stack can heal **up to your max** before the tier bonus is applied; pick the **`|mN`** line that matches your bottle.
- **After `/item`:** No elixir **buff slot** is left (you can drink another elixir type immediately after, subject to rules). Extra **current** above **max** lasts until you **take damage** (not tracked as a timed buff).

---

### Fairy Tonic

- **Effect:** Heals **missing** HP only — never above your **real max** hearts. **Heal budget** by tier: **½ / ¾ / full** max hearts (floored whole hearts), then **`min(budget, missing)`**. **Fairy / Mock Fairy** extras add to the heal budget on that stack.
- **After `/item`:** No elixir buff slot — pure heal.

---

### Enduring Elixir

- **Effect:** Adds **temporary stamina chunks** to **current** only — **`ceil(maxStamina × M) − maxStamina`**, at least **+1**, with **M** = **1.25 / 1.45 / 1.7** for Basic / Mid / High (see **Tiers**). **Max** stamina does not increase.
- **After `/item`:** No elixir buff slot. Your **current** can sit above **max** until you spend stamina; the bot may clamp **current** down toward **max** when appropriate (see **Reminder**).

---

### Energizing Elixir

- **Effect:** Restores **+5 / +7 / +9** stamina **chunks** (Basic / Mid / High) on **`/item`**, **capped at your max** stamina. There is **no** ongoing attack, defense, or resistance buff — only the refill.

---

## Commands (short)

| Command | Role |
| --- | --- |
| **`/item`** | Use elixirs and items (here: elixirs). |
| **`/crafting brew`** | **Witch** role — elixirs through the mixer. |
| **`/crafting recipe`** | Other jobs’ fixed recipes — **not** the main elixir pipeline for Witches. |

**`/crafting brew`** runs in **village town hall** (the bot’s crafting channel).

---

## Brewing (`/crafting brew`)

1. **Witch** runs **`/crafting brew`** → **character** + **elixir** line.
2. Menus: **critter** (matches **effect family**) → **monster part** (often **Chuchu Jelly**; some lines need a colored jelly / element part — the bot tells you).
3. Optional **extras** (parts or same-family critters, up to the limit). **Fairy / Mock Fairy** can add **bonus hearts** on **`/item`** and count strong for **tier** math.
4. **Cancel** before finish → no ingredients or stamina spent. **Finish** → spend ingredients + stamina, get the bottle with a **tier** (**mixer score** on the result).

**Chuchu Jelly** (and similar) go in the mixer; **Chuchu Egg** is for other systems (e.g. hatch / pet).

### Why ingredients matter

- **Critters** have an **effect family** (chilly, mighty, …) — must match the elixir you’re brewing.
- **Parts** have an **element** — many brews allow **neutral**; some need **fire** (e.g. Chilly), **ice** (Spicy), **electric** (Electro), **undead-adjacent** (Bright), etc.

### Rarity & tier from the mixer

Each ingredient has **rarity** (often **1–10**). The mixer blends **critter + part + extras** into a **score** → **Basic (1–3)**, **Mid (4–6)**, or **High (7–10)**. **Rarer** ingredients and **on-theme extras** (same family critter, matching part on threaded recipes) help. **Fairy / Mock Fairy** count as at least **rarity 5** for that math. **Mix-in** hearts from Fairies are tracked **separately** on the inventory row.

---

## Quick reminders

- **One** active buff elixir at a time; many bottles in inventory is fine.
- **Quantity 1** per **`/item`** for elixirs.
- **Witch** role: elixirs from **`/crafting brew`**.
- **Chilly** = heat/fire · **Sticky** = water · **Bright** = blight.
- Only items the mixer **menus** offer as labeled critters/parts will work.

---

## See also

- Mixer design detail: **`docs/elixir-mixing/README.md`**
