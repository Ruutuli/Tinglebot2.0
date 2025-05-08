import { assert } from "chai";

import { precipitations } from "../src/data/weather/precipitations";
import { specials } from "../src/data/weather/specials";
import { temperatures } from "../src/data/weather/temperatures";
import { winds } from "../src/data/weather/winds";

suite("Weather Tests", () => {
  suite("Temperature", () => {
    const temps = new Set(temperatures.map((el) => el.name));
    test("Temperatures should be unique", () => {
      assert.equal(
        temps.size,
        temperatures.length,
        "temperatures are not unique!"
      );
    });
  });

  suite("Winds", () => {
    const wind = new Set(winds.map((el) => el.name));
    test("Winds should be unique", () => {
      assert.equal(wind.size, winds.length, "winds are not unique!");
    });
  });

  suite("Precipitations", () => {
    const precip = new Set(precipitations.map((el) => el.name));
    test("Precipitations should be unique", () => {
      assert.equal(
        precip.size,
        precipitations.length,
        "precipitations are not unique!"
      );
    });

    for (const precipitation of precipitations) {
      test(`${precipitation.name} should have unique temps`, () => {
        if (precipitation.temps === "any") {
          return;
        }
        const temps = new Set(precipitation.temps);
        assert.equal(
          temps.size,
          precipitation.temps.length,
          `${precipitation.name} temps are not unique!`
        );
      });

      test(`${precipitation.name} should have unique winds`, () => {
        if (precipitation.winds === "any") {
          return;
        }
        const winds = new Set(precipitation.winds);
        assert.equal(
          winds.size,
          precipitation.winds.length,
          `${precipitation.name} winds are not unique!`
        );
      });
    }
  });

  suite("Specials", () => {
    const spec = new Set(specials.map((el) => el.name));
    test("Specials should be unique", () => {
      assert.equal(spec.size, specials.length, "specials are not unique!");
    });

    for (const special of specials) {
      test(`${special.name} should have unique temps`, () => {
        if (special.temps === "any") {
          return;
        }
        const temps = new Set(special.temps);
        assert.equal(
          temps.size,
          special.temps.length,
          `${special.name} temps are not unique!`
        );
      });

      test(`${special.name} should have unique winds`, () => {
        if (special.winds === "any") {
          return;
        }
        const winds = new Set(special.winds);
        assert.equal(
          winds.size,
          special.winds.length,
          `${special.name} winds are not unique!`
        );
      });

      test(`${special.name} should have unique precipitation`, () => {
        if (special.precipitations === "any") {
          return;
        }
        const precip = new Set(special.precipitations);
        assert.equal(
          precip.size,
          special.precipitations.length,
          `${special.name} precipitation is not unique!`
        );
      });
    }
  });
});
