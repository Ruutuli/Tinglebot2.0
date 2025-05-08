import { assert } from "chai";

import { inarikoSeasons } from "../src/data/weather/regions/inarikoSeasons";
import { rudaniaSeasons } from "../src/data/weather/regions/rudaniaSeasons";
import { vhintlSeasons } from "../src/data/weather/regions/vhintlSeasons";

suite("Region Tests", () => {
  suite("Inariko", () => {
    test("Seasons should be unique", () => {
      const seasons = new Set(inarikoSeasons.map((el) => el.season));
      assert.equal(
        seasons.size,
        inarikoSeasons.length,
        "seasons are not unique!"
      );
    });

    for (const season of inarikoSeasons) {
      test(`${season.season} should have unique temps`, () => {
        const temps = new Set(season.temps);
        assert.equal(
          temps.size,
          season.temps.length,
          `${season.season} temps are not unique!`
        );
      });

      test(`${season.season} should have unique winds`, () => {
        const winds = new Set(season.wind);
        assert.equal(
          winds.size,
          season.wind.length,
          `${season.season} winds are not unique!`
        );
      });

      test(`${season.season} should have unique precipitation`, () => {
        const precipitation = new Set(season.precipitation);
        assert.equal(
          precipitation.size,
          season.precipitation.length,
          `${season.season} precipitation is not unique!`
        );
      });

      test(`${season.season} should have unique specials`, () => {
        const specials = new Set(season.special);
        assert.equal(
          specials.size,
          season.special.length,
          `${season.season} specials are not unique!`
        );
      });
    }
  });

  suite("Rudania", () => {
    test("Seasons should be unique", () => {
      const seasons = new Set(rudaniaSeasons.map((el) => el.season));
      assert.equal(
        seasons.size,
        rudaniaSeasons.length,
        "seasons are not unique!"
      );
    });

    for (const season of rudaniaSeasons) {
      test(`${season.season} should have unique temps`, () => {
        const temps = new Set(season.temps);
        assert.equal(
          temps.size,
          season.temps.length,
          `${season.season} temps are not unique!`
        );
      });

      test(`${season.season} should have unique winds`, () => {
        const winds = new Set(season.wind);
        assert.equal(
          winds.size,
          season.wind.length,
          `${season.season} winds are not unique!`
        );
      });

      test(`${season.season} should have unique precipitation`, () => {
        const precipitation = new Set(season.precipitation);
        assert.equal(
          precipitation.size,
          season.precipitation.length,
          `${season.season} precipitation is not unique!`
        );
      });

      test(`${season.season} should have unique specials`, () => {
        const specials = new Set(season.special);
        assert.equal(
          specials.size,
          season.special.length,
          `${season.season} specials are not unique!`
        );
      });
    }
  });

  suite("Vhintl", () => {
    test("Seasons should be unique", () => {
      const seasons = new Set(vhintlSeasons.map((el) => el.season));
      assert.equal(
        seasons.size,
        vhintlSeasons.length,
        "seasons are not unique!"
      );
    });

    for (const season of vhintlSeasons) {
      test(`${season.season} should have unique temps`, () => {
        const temps = new Set(season.temps);
        assert.equal(
          temps.size,
          season.temps.length,
          `${season.season} temps are not unique!`
        );
      });

      test(`${season.season} should have unique winds`, () => {
        const winds = new Set(season.wind);
        assert.equal(
          winds.size,
          season.wind.length,
          `${season.season} winds are not unique!`
        );
      });

      test(`${season.season} should have unique precipitation`, () => {
        const precipitation = new Set(season.precipitation);
        assert.equal(
          precipitation.size,
          season.precipitation.length,
          `${season.season} precipitation is not unique!`
        );
      });

      test(`${season.season} should have unique specials`, () => {
        const specials = new Set(season.special);
        assert.equal(
          specials.size,
          season.special.length,
          `${season.season} specials are not unique!`
        );
      });
    }
  });
});
