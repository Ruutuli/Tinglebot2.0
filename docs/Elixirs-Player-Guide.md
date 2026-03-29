# Elixirs — simple player guide

This is for **players**, not coders. If something here disagrees with what the bot actually says in Discord, **trust the bot** and ask staff.

---

## The one-minute version

1. **Get** elixirs from loot, shops, rewards, or by **brewing** (if your character can).
2. **Drink** them with **`/item`** (pick your character and the elixir from the list).
3. Many elixirs give you a **buff that stays until the right kind of activity “uses it up”** (not a real-world timer).
4. **Stronger bottles** come in **Basic**, **Mid**, and **High** tiers — your inventory list shows which stack you are using.

---

## Commands you actually need

| Command | What it does |
| --- | --- |
| **`/item`** | **Use / drink** an item. This is how you consume an elixir. Fill in **character name** and **item name** (use autocomplete). For elixirs, you can only use **quantity 1** at a time. |
| **`/crafting brew`** | **Brew** a mixer elixir as a **Witch**. You choose the elixir type, then the bot walks you through **menus** (critter → monster part → optional extras like more parts or **Fairy** / **Mock Fairy**). Ingredients and stamina are spent when the brew **finishes**; if you **cancel** mid-flow, **nothing** is taken. |
| **`/crafting recipe`** | **Normal crafting** for recipes (not the step-by-step mixer). Your character must be allowed to craft that item in that village’s rules. |

**Where you can use them**

- **`/item`** only works in **town hall** channels, the **community board** channel, or **threads inside** those places (plus any staff **test** channel the bot allows).
- **`/crafting`** (including **brew**) is meant for your character’s **village town hall** channel (same idea as other crafting — if the bot says “wrong channel,” move to the place it names).

Always use **autocomplete** for character and item names so you don’t typo.

---

## Picking the right bottle in `/item` (Basic / Mid / High)

Your elixir stacks can have different **potency**. In autocomplete, elixirs often look like:

- `Hearty Elixir [Basic]`
- `Mighty Elixir [Mid]`
- `Chilly Elixir [High|m2]` (example: extra fairy heal tracked as `m` — pick the line that matches **your** stack)

**Rule of thumb:** the tag in brackets is the **tier** of that **specific** stack. Pick the line that matches what you own. The bot uses **one stack at a time** and tends to use **lower tiers first** when you don’t specify — so if you care about potency, **always choose the exact autocomplete line** for the stack you want.

---

## What happens when you drink?

Roughly three cases:

### A) Instant “do the thing” drinks

Some bottles apply **right away** and **do not** leave a long-term buff slot in the same way as resist elixirs. In practice, treat these as **one-shot** when you use **`/item`**:

- **Hearty Elixir** — extra hearts when you drink (tier matters: more hearts on higher tiers).
- **Fairy Tonic** — heals **missing** hearts only, up to a cap per tier (won’t overheal above your **real** max).
- **Enduring Elixir** — adds **extra max stamina** (and current stamina) when you drink; tier changes how big the bump is.

### B) Buffs that last until “used”

Most other elixirs set an **active buff**. It does **not** run out after 10 minutes in real life. It goes away when you do something that **consumes** that buff (for example: the right kind of travel, fight, gather, loot, etc., depending on the elixir).

Examples of what you’re **trying** to do with those:

| Elixir | Plain English |
| --- | --- |
| **Chilly Elixir** | Helps vs **heat / fire** (including fire-type trouble). |
| **Spicy Elixir** | Helps vs **cold / ice** enemies. |
| **Electro Elixir** | Helps vs **electric / shock** enemies. |
| **Sticky Elixir** | Helps vs **water**-related trouble; also tied to **yield** style bonuses where the game uses them. |
| **Bright Elixir** | Helps vs **blight** when the world says blight is a factor (travel, gather, loot, raids, etc.). |
| **Energizing Elixir** | Stamina **refill** when you drink; buff side is consumed on things like **gather / loot / crafting** when the system applies it. |
| **Hasty Elixir** | **Speed / travel** — often eaten when you **travel**. |
| **Mighty / Tough** | **Attack** or **defense** — usually tied to **combat-style** actions. |
| **Sneaky Elixir** | **Stealth** and **flee** — often tied to **gather / loot / travel**. |

Exact moments are handled by the bot; you don’t need to memorize code — just know: **bring the right elixir for the kind of trouble you expect.**

### C) Optional: Fairy / Mock Fairy in brewing

If the mixer lets you add **Fairy** or **Mock Fairy**, that can add a **small heal when you drink** the finished elixir (on top of the normal elixir effect). The bot’s brew text explains what’s allowed for that recipe.

---

## Brewing (`/crafting brew`) — step by step

1. Your character must be a **Witch** (or otherwise allowed the way your server rules say).
2. Run **`/crafting brew`**, choose **character** and the **elixir** you want to make (autocomplete).
3. Follow the **menus**:
   - Pick a **critter** that matches the recipe rules.
   - Pick a **monster part** (often neutral **Chuchu Jelly**; some elixirs need a **colored** jelly or specific element part — the bot will tell you).
   - Optionally add **extras** (more parts or same-family critters, up to the limit the bot shows).
   - **Fairy / Mock Fairy** may be offered as an extra for a bit of heal-on-drink.
4. **Cancel** anytime before completion — **no refund drama** because nothing was consumed yet.
5. When it **completes**, you get the elixir in inventory (with a **tier** from how good your mix was: Basic / Mid / High).

**Note:** **Chuchu Egg** is **not** a mixer ingredient — use **Chuchu Jelly** (and similar) instead.

---

## Quick mistakes to avoid

- Using **`/item`** in a random channel → bot will say **wrong channel**; move to town hall or community board.
- Typing item names by hand → use **autocomplete**.
- Trying to chug **more than one elixir per `/item`** → set **quantity** to **1** for elixirs.
- Expecting **Chilly** to help in **water** or **blight** — that’s **Sticky** / **Bright**, not Chilly.
- Expecting **Bright** to replace **Chilly** for fire — **Chilly** is the heat/fire one.

---

## Need more detail?

Staff and recipe math live in **`docs/elixir-mixing/README.md`** (technical). This file is only the **friendly overview**.
