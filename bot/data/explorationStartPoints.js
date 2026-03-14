// Canonical expedition start square/quadrant per region (Create expedition UI).
// Used by explore.js, exploreModule.js (handleExpeditionFailedFromWave), and should match dashboard.
const START_POINTS_BY_REGION = {
  eldin: { square: "H5", quadrant: "Q3" },
  lanayru: { square: "H8", quadrant: "Q2" },
  faron: { square: "F10", quadrant: "Q4" },
};

module.exports = { START_POINTS_BY_REGION };
