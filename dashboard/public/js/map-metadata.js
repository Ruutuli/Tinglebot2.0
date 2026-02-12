/**
 * Map Metadata - Square status and region information
 * Handles square metadata including status and region data
 */

class MapMetadata {
    constructor() {
        this.squareData = new Map();
        this.initializeSquareData();
    }
    
    /**
     * Initialize square data from CSV data
     */
    initializeSquareData() {
        // CSV data from "ROTW_Map Coords_2025 - Sheet1.csv"
        const csvData = [
          {
                    "square": "A1",
                    "letter": "A",
                    "number": 1,
                    "region": "Hebra",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": false,
                                        "status": "inaccessible"
                              }
                    ]
          },
          {
                    "square": "A10",
                    "letter": "A",
                    "number": 10,
                    "region": "Gerudo",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": true,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": true,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": false,
                                        "status": "explorable"
                              }
                    ]
          },
          {
                    "square": "A11",
                    "letter": "A",
                    "number": 11,
                    "region": "Gerudo",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": false,
                                        "status": "explorable"
                              }
                    ]
          },
          {
                    "square": "A12",
                    "letter": "A",
                    "number": 12,
                    "region": "Gerudo",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": false,
                                        "status": "inaccessible"
                              }
                    ]
          },
          {
                    "square": "A2",
                    "letter": "A",
                    "number": 2,
                    "region": "Hebra",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": false,
                                        "status": "explorable"
                              }
                    ]
          },
          {
                    "square": "A3",
                    "letter": "A",
                    "number": 3,
                    "region": "Hebra",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": false,
                                        "status": "explorable"
                              }
                    ]
          },
          {
                    "square": "A4",
                    "letter": "A",
                    "number": 4,
                    "region": "Hebra",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": false,
                                        "status": "inaccessible"
                              }
                    ]
          },
          {
                    "square": "A5",
                    "letter": "A",
                    "number": 5,
                    "region": "Hebra",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": false,
                                        "status": "inaccessible"
                              }
                    ]
          },
          {
                    "square": "A6",
                    "letter": "A",
                    "number": 6,
                    "region": "Hebra",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": false,
                                        "status": "explorable"
                              }
                    ]
          },
          {
                    "square": "A7",
                    "letter": "A",
                    "number": 7,
                    "region": "Hebra",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": false,
                                        "status": "explorable"
                              }
                    ]
          },
          {
                    "square": "A8",
                    "letter": "A",
                    "number": 8,
                    "region": "Hebra",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": false,
                                        "status": "explorable"
                              }
                    ]
          },
          {
                    "square": "A9",
                    "letter": "A",
                    "number": 9,
                    "region": "Gerudo",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": true,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": true,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": true,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": true,
                                        "status": "explorable"
                              }
                    ]
          },
          {
                    "square": "B1",
                    "letter": "B",
                    "number": 1,
                    "region": "Hebra",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": false,
                                        "status": "explorable"
                              }
                    ]
          },
          {
                    "square": "B10",
                    "letter": "B",
                    "number": 10,
                    "region": "Gerudo",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": true,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": true,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": true,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": true,
                                        "status": "explorable"
                              }
                    ]
          },
          {
                    "square": "B11",
                    "letter": "B",
                    "number": 11,
                    "region": "Gerudo",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": true,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": true,
                                        "status": "explorable"
                              }
                    ]
          },
          {
                    "square": "B12",
                    "letter": "B",
                    "number": 12,
                    "region": "Gerudo",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": true,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": true,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": true,
                                        "status": "inaccessible"
                              }
                    ]
          },
          {
                    "square": "B2",
                    "letter": "B",
                    "number": 2,
                    "region": "Hebra",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": false,
                                        "status": "explorable"
                              }
                    ]
          },
          {
                    "square": "B3",
                    "letter": "B",
                    "number": 3,
                    "region": "Hebra",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": false,
                                        "status": "explorable"
                              }
                    ]
          },
          {
                    "square": "B4",
                    "letter": "B",
                    "number": 4,
                    "region": "Hebra",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": false,
                                        "status": "explorable"
                              }
                    ]
          },
          {
                    "square": "B5",
                    "letter": "B",
                    "number": 5,
                    "region": "Hebra",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": false,
                                        "status": "explorable"
                              }
                    ]
          },
          {
                    "square": "B6",
                    "letter": "B",
                    "number": 6,
                    "region": "Hebra",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": true,
                                        "status": "explorable"
                              }
                    ]
          },
          {
                    "square": "B7",
                    "letter": "B",
                    "number": 7,
                    "region": "Gerudo",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": false,
                                        "status": "explorable"
                              }
                    ]
          },
          {
                    "square": "B8",
                    "letter": "B",
                    "number": 8,
                    "region": "Gerudo",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": true,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": false,
                                        "status": "explorable"
                              }
                    ]
          },
          {
                    "square": "B9",
                    "letter": "B",
                    "number": 9,
                    "region": "Gerudo",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": true,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": true,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": true,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": true,
                                        "status": "explorable"
                              }
                    ]
          },
          {
                    "square": "C1",
                    "letter": "C",
                    "number": 1,
                    "region": "Hebra",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": false,
                                        "status": "inaccessible"
                              }
                    ]
          },
          {
                    "square": "C10",
                    "letter": "C",
                    "number": 10,
                    "region": "Gerudo",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": true,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": true,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": true,
                                        "status": "explorable"
                              }
                    ]
          },
          {
                    "square": "C11",
                    "letter": "C",
                    "number": 11,
                    "region": "Gerudo",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": true,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": true,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": true,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": true,
                                        "status": "explorable"
                              }
                    ]
          },
          {
                    "square": "C12",
                    "letter": "C",
                    "number": 12,
                    "region": "Gerudo",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": true,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": true,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": true,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": true,
                                        "status": "inaccessible"
                              }
                    ]
          },
          {
                    "square": "C2",
                    "letter": "C",
                    "number": 2,
                    "region": "Hebra",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": false,
                                        "status": "explorable"
                              }
                    ]
          },
          {
                    "square": "C3",
                    "letter": "C",
                    "number": 3,
                    "region": "Hebra",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": false,
                                        "status": "explorable"
                              }
                    ]
          },
          {
                    "square": "C4",
                    "letter": "C",
                    "number": 4,
                    "region": "Hebra",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": false,
                                        "status": "explorable"
                              }
                    ]
          },
          {
                    "square": "C5",
                    "letter": "C",
                    "number": 5,
                    "region": "Hebra",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": true,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": true,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": true,
                                        "status": "explorable"
                              }
                    ]
          },
          {
                    "square": "C6",
                    "letter": "C",
                    "number": 6,
                    "region": "Central Hyrule",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": true,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": true,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": true,
                                        "status": "explorable"
                              }
                    ]
          },
          {
                    "square": "C7",
                    "letter": "C",
                    "number": 7,
                    "region": "Central Hyrule",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": true,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": true,
                                        "status": "explorable"
                              }
                    ]
          },
          {
                    "square": "C8",
                    "letter": "C",
                    "number": 8,
                    "region": "Gerudo",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": false,
                                        "status": "explorable"
                              }
                    ]
          },
          {
                    "square": "C9",
                    "letter": "C",
                    "number": 9,
                    "region": "Gerudo",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": true,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": false,
                                        "status": "explorable"
                              }
                    ]
          },
          {
                    "square": "D1",
                    "letter": "D",
                    "number": 1,
                    "region": "Hebra",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": false,
                                        "status": "inaccessible"
                              }
                    ]
          },
          {
                    "square": "D10",
                    "letter": "D",
                    "number": 10,
                    "region": "Gerudo",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": true,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": false,
                                        "status": "explorable"
                              }
                    ]
          },
          {
                    "square": "D11",
                    "letter": "D",
                    "number": 11,
                    "region": "Gerudo",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": true,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": true,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": false,
                                        "status": "explorable"
                              }
                    ]
          },
          {
                    "square": "D12",
                    "letter": "D",
                    "number": 12,
                    "region": "Gerudo",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": true,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": true,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": false,
                                        "status": "inaccessible"
                              }
                    ]
          },
          {
                    "square": "D2",
                    "letter": "D",
                    "number": 2,
                    "region": "Hebra",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": false,
                                        "status": "explorable"
                              }
                    ]
          },
          {
                    "square": "D3",
                    "letter": "D",
                    "number": 3,
                    "region": "Hebra",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": false,
                                        "status": "explorable"
                              }
                    ]
          },
          {
                    "square": "D4",
                    "letter": "D",
                    "number": 4,
                    "region": "Hebra",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": true,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": true,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": true,
                                        "status": "explorable"
                              }
                    ]
          },
          {
                    "square": "D5",
                    "letter": "D",
                    "number": 5,
                    "region": "Central Hyrule",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": true,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": false,
                                        "status": "explorable"
                              }
                    ]
          },
          {
                    "square": "D6",
                    "letter": "D",
                    "number": 6,
                    "region": "Central Hyrule",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": false,
                                        "status": "explorable"
                              }
                    ]
          },
          {
                    "square": "D7",
                    "letter": "D",
                    "number": 7,
                    "region": "Central Hyrule",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": true,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": false,
                                        "status": "explorable"
                              }
                    ]
          },
          {
                    "square": "D8",
                    "letter": "D",
                    "number": 8,
                    "region": "Central Hyrule",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": false,
                                        "status": "explorable"
                              }
                    ]
          },
          {
                    "square": "D9",
                    "letter": "D",
                    "number": 9,
                    "region": "Gerudo",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": false,
                                        "status": "explorable"
                              }
                    ]
          },
          {
                    "square": "E1",
                    "letter": "E",
                    "number": 1,
                    "region": "Hebra",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": false,
                                        "status": "inaccessible"
                              }
                    ]
          },
          {
                    "square": "E10",
                    "letter": "E",
                    "number": 10,
                    "region": "Faron",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": true,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": true,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": true,
                                        "status": "explorable"
                              }
                    ]
          },
          {
                    "square": "E11",
                    "letter": "E",
                    "number": 11,
                    "region": "Gerudo",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": true,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": true,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": true,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": true,
                                        "status": "explorable"
                              }
                    ]
          },
          {
                    "square": "E12",
                    "letter": "E",
                    "number": 12,
                    "region": "Faron",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": false,
                                        "status": "inaccessible"
                              }
                    ]
          },
          {
                    "square": "E2",
                    "letter": "E",
                    "number": 2,
                    "region": "Hebra",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": true,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": true,
                                        "status": "explorable"
                              }
                    ]
          },
          {
                    "square": "E3",
                    "letter": "E",
                    "number": 3,
                    "region": "Central Hyrule",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": true,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": true,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": true,
                                        "status": "explorable"
                              }
                    ]
          },
          {
                    "square": "E4",
                    "letter": "E",
                    "number": 4,
                    "region": "Central Hyrule",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": true,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": false,
                                        "status": "explorable"
                              }
                    ]
          },
          {
                    "square": "E5",
                    "letter": "E",
                    "number": 5,
                    "region": "Central Hyrule",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": true,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": true,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": true,
                                        "status": "explorable"
                              }
                    ]
          },
          {
                    "square": "E6",
                    "letter": "E",
                    "number": 6,
                    "region": "Central Hyrule",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": true,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": true,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": true,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": false,
                                        "status": "explorable"
                              }
                    ]
          },
          {
                    "square": "E7",
                    "letter": "E",
                    "number": 7,
                    "region": "Central Hyrule",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": true,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": true,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": true,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": true,
                                        "status": "explorable"
                              }
                    ]
          },
          {
                    "square": "E8",
                    "letter": "E",
                    "number": 8,
                    "region": "Central Hyrule",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": true,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": true,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": true,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": true,
                                        "status": "explorable"
                              }
                    ]
          },
          {
                    "square": "E9",
                    "letter": "E",
                    "number": 9,
                    "region": "Central Hyrule",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": true,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": true,
                                        "status": "explorable"
                              }
                    ]
          },
          {
                    "square": "F1",
                    "letter": "F",
                    "number": 1,
                    "region": "Eldin",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": true,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": true,
                                        "status": "inaccessible"
                              }
                    ]
          },
          {
                    "square": "F10",
                    "letter": "F",
                    "number": 10,
                    "region": "Faron",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": true,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": true,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": false,
                                        "status": "explorable"
                              }
                    ]
          },
          {
                    "square": "F11",
                    "letter": "F",
                    "number": 11,
                    "region": "Faron",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": true,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": true,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": true,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": true,
                                        "status": "explorable"
                              }
                    ]
          },
          {
                    "square": "F12",
                    "letter": "F",
                    "number": 12,
                    "region": "Faron",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": false,
                                        "status": "inaccessible"
                              }
                    ]
          },
          {
                    "square": "F2",
                    "letter": "F",
                    "number": 2,
                    "region": "Central Hyrule",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": true,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": true,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": true,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": true,
                                        "status": "explorable"
                              }
                    ]
          },
          {
                    "square": "F3",
                    "letter": "F",
                    "number": 3,
                    "region": "Central Hyrule",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": false,
                                        "status": "explorable"
                              }
                    ]
          },
          {
                    "square": "F4",
                    "letter": "F",
                    "number": 4,
                    "region": "Central Hyrule",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": false,
                                        "status": "explorable"
                              }
                    ]
          },
          {
                    "square": "F5",
                    "letter": "F",
                    "number": 5,
                    "region": "Central Hyrule",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": false,
                                        "status": "explorable"
                              }
                    ]
          },
          {
                    "square": "F6",
                    "letter": "F",
                    "number": 6,
                    "region": "Central Hyrule",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": true,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": false,
                                        "status": "explorable"
                              }
                    ]
          },
          {
                    "square": "F7",
                    "letter": "F",
                    "number": 7,
                    "region": "Central Hyrule",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": true,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": true,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": false,
                                        "status": "explorable"
                              }
                    ]
          },
          {
                    "square": "F8",
                    "letter": "F",
                    "number": 8,
                    "region": "Lanayru",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": true,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": true,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": false,
                                        "status": "explorable"
                              }
                    ]
          },
          {
                    "square": "F9",
                    "letter": "F",
                    "number": 9,
                    "region": "Faron",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": true,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": true,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": true,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": false,
                                        "status": "explorable"
                              }
                    ]
          },
          {
                    "square": "G1",
                    "letter": "G",
                    "number": 1,
                    "region": "Eldin",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": false,
                                        "status": "inaccessible"
                              }
                    ]
          },
          {
                    "square": "G10",
                    "letter": "G",
                    "number": 10,
                    "region": "Faron",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": false,
                                        "status": "explorable"
                              }
                    ]
          },
          {
                    "square": "G11",
                    "letter": "G",
                    "number": 11,
                    "region": "Faron",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": true,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": true,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": true,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": true,
                                        "status": "explorable"
                              }
                    ]
          },
          {
                    "square": "G12",
                    "letter": "G",
                    "number": 12,
                    "region": "Faron",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": false,
                                        "status": "inaccessible"
                              }
                    ]
          },
          {
                    "square": "G2",
                    "letter": "G",
                    "number": 2,
                    "region": "Eldin",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": true,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": true,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": true,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": true,
                                        "status": "explorable"
                              }
                    ]
          },
          {
                    "square": "G3",
                    "letter": "G",
                    "number": 3,
                    "region": "Eldin",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": true,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": true,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": false,
                                        "status": "explorable"
                              }
                    ]
          },
          {
                    "square": "G4",
                    "letter": "G",
                    "number": 4,
                    "region": "Eldin",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": false,
                                        "status": "explorable"
                              }
                    ]
          },
          {
                    "square": "G5",
                    "letter": "G",
                    "number": 5,
                    "region": "Eldin",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": false,
                                        "status": "explorable"
                              }
                    ]
          },
          {
                    "square": "G6",
                    "letter": "G",
                    "number": 6,
                    "region": "Eldin",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": true,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": true,
                                        "status": "explorable"
                              }
                    ]
          },
          {
                    "square": "G7",
                    "letter": "G",
                    "number": 7,
                    "region": "Lanayru",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": true,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": true,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": true,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": true,
                                        "status": "explorable"
                              }
                    ]
          },
          {
                    "square": "G8",
                    "letter": "G",
                    "number": 8,
                    "region": "Lanayru",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": false,
                                        "status": "explorable"
                              }
                    ]
          },
          {
                    "square": "G9",
                    "letter": "G",
                    "number": 9,
                    "region": "Lanayru",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": false,
                                        "status": "explorable"
                              }
                    ]
          },
          {
                    "square": "H1",
                    "letter": "H",
                    "number": 1,
                    "region": "Eldin",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": false,
                                        "status": "inaccessible"
                              }
                    ]
          },
          {
                    "square": "H10",
                    "letter": "H",
                    "number": 10,
                    "region": "Faron",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": false,
                                        "status": "explorable"
                              }
                    ]
          },
          {
                    "square": "H11",
                    "letter": "H",
                    "number": 11,
                    "region": "Faron",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": true,
                                        "status": "explorable"
                              }
                    ]
          },
          {
                    "square": "H12",
                    "letter": "H",
                    "number": 12,
                    "region": "Faron",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": false,
                                        "status": "inaccessible"
                              }
                    ]
          },
          {
                    "square": "H2",
                    "letter": "H",
                    "number": 2,
                    "region": "Eldin",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": true,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": true,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": true,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": true,
                                        "status": "explorable"
                              }
                    ]
          },
          {
                    "square": "H3",
                    "letter": "H",
                    "number": 3,
                    "region": "Eldin",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": true,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": true,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": false,
                                        "status": "explorable"
                              }
                    ]
          },
          {
                    "square": "H4",
                    "letter": "H",
                    "number": 4,
                    "region": "Eldin",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": false,
                                        "status": "explorable"
                              }
                    ]
          },
          {
                    "square": "H5",
                    "letter": "H",
                    "number": 5,
                    "region": "Eldin",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": false,
                                        "status": "explorable"
                              }
                    ]
          },
          {
                    "square": "H6",
                    "letter": "H",
                    "number": 6,
                    "region": "Eldin",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": true,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": false,
                                        "status": "explorable"
                              }
                    ]
          },
          {
                    "square": "H7",
                    "letter": "H",
                    "number": 7,
                    "region": "Lanayru",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": false,
                                        "status": "explorable"
                              }
                    ]
          },
          {
                    "square": "H8",
                    "letter": "H",
                    "number": 8,
                    "region": "Lanayru",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": false,
                                        "status": "explorable"
                              }
                    ]
          },
          {
                    "square": "H9",
                    "letter": "H",
                    "number": 9,
                    "region": "Faron",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": false,
                                        "status": "explorable"
                              }
                    ]
          },
          {
                    "square": "I1",
                    "letter": "I",
                    "number": 1,
                    "region": "Eldin",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": false,
                                        "status": "inaccessible"
                              }
                    ]
          },
          {
                    "square": "I10",
                    "letter": "I",
                    "number": 10,
                    "region": "Faron",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": true,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": true,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": false,
                                        "status": "inaccessible"
                              }
                    ]
          },
          {
                    "square": "I11",
                    "letter": "I",
                    "number": 11,
                    "region": "Faron",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": true,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": true,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": false,
                                        "status": "explorable"
                              }
                    ]
          },
          {
                    "square": "I12",
                    "letter": "I",
                    "number": 12,
                    "region": "Faron",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": false,
                                        "status": "inaccessible"
                              }
                    ]
          },
          {
                    "square": "I2",
                    "letter": "I",
                    "number": 2,
                    "region": "Eldin",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": true,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": true,
                                        "status": "explorable"
                              }
                    ]
          },
          {
                    "square": "I3",
                    "letter": "I",
                    "number": 3,
                    "region": "Eldin",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": true,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": true,
                                        "status": "explorable"
                              }
                    ]
          },
          {
                    "square": "I4",
                    "letter": "I",
                    "number": 4,
                    "region": "Eldin",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": true,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": true,
                                        "status": "explorable"
                              }
                    ]
          },
          {
                    "square": "I5",
                    "letter": "I",
                    "number": 5,
                    "region": "Eldin",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": false,
                                        "status": "explorable"
                              }
                    ]
          },
          {
                    "square": "I6",
                    "letter": "I",
                    "number": 6,
                    "region": "Lanayru",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": false,
                                        "status": "explorable"
                              }
                    ]
          },
          {
                    "square": "I7",
                    "letter": "I",
                    "number": 7,
                    "region": "Lanayru",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": false,
                                        "status": "explorable"
                              }
                    ]
          },
          {
                    "square": "I8",
                    "letter": "I",
                    "number": 8,
                    "region": "Lanayru",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": false,
                                        "status": "explorable"
                              }
                    ]
          },
          {
                    "square": "I9",
                    "letter": "I",
                    "number": 9,
                    "region": "Lanayru",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": false,
                                        "status": "explorable"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": true,
                                        "status": "explorable"
                              }
                    ]
          },
          {
                    "square": "J1",
                    "letter": "J",
                    "number": 1,
                    "region": "Eldin",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": false,
                                        "status": "inaccessible"
                              }
                    ]
          },
          {
                    "square": "J10",
                    "letter": "J",
                    "number": 10,
                    "region": "Faron",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": true,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": false,
                                        "status": "inaccessible"
                              }
                    ]
          },
          {
                    "square": "J11",
                    "letter": "J",
                    "number": 11,
                    "region": "Faron",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": false,
                                        "status": "inaccessible"
                              }
                    ]
          },
          {
                    "square": "J12",
                    "letter": "J",
                    "number": 12,
                    "region": "Faron",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": false,
                                        "status": "inaccessible"
                              }
                    ]
          },
          {
                    "square": "J2",
                    "letter": "J",
                    "number": 2,
                    "region": "Eldin",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": false,
                                        "status": "inaccessible"
                              }
                    ]
          },
          {
                    "square": "J3",
                    "letter": "J",
                    "number": 3,
                    "region": "Eldin",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": true,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": true,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": false,
                                        "status": "inaccessible"
                              }
                    ]
          },
          {
                    "square": "J4",
                    "letter": "J",
                    "number": 4,
                    "region": "Eldin",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": true,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": false,
                                        "status": "inaccessible"
                              }
                    ]
          },
          {
                    "square": "J5",
                    "letter": "J",
                    "number": 5,
                    "region": "Eldin",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": false,
                                        "status": "inaccessible"
                              }
                    ]
          },
          {
                    "square": "J6",
                    "letter": "J",
                    "number": 6,
                    "region": "Lanayru",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": false,
                                        "status": "inaccessible"
                              }
                    ]
          },
          {
                    "square": "J7",
                    "letter": "J",
                    "number": 7,
                    "region": "Lanayru",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": false,
                                        "status": "inaccessible"
                              }
                    ]
          },
          {
                    "square": "J8",
                    "letter": "J",
                    "number": 8,
                    "region": "Lanayru",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": false,
                                        "status": "inaccessible"
                              }
                    ]
          },
          {
                    "square": "J9",
                    "letter": "J",
                    "number": 9,
                    "region": "Lanayru",
                    "quadrants": [
                              {
                                        "quadrantId": "Q1",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q2",
                                        "blighted": false,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q3",
                                        "blighted": true,
                                        "status": "inaccessible"
                              },
                              {
                                        "quadrantId": "Q4",
                                        "blighted": false,
                                        "status": "inaccessible"
                              }
                    ]
          }
];
        
        // Populate the square data map
        csvData.forEach(data => {
            this.squareData.set(data.square, {
                square: data.square,
                letter: data.letter,
                number: data.number,
                region: data.region,
                quadrants: data.quadrants
            });
        });
    }
    
    /**
     * Get metadata for a specific square
     * @param {string} squareId - Square ID like "E4"
     * @returns {Object|null} Square metadata or null if not found
     */
    getSquareMetadata(squareId) {
        return this.squareData.get(squareId) || null;
    }
    
    /**
     * Get all squares in a specific region
     * @param {string} region - Region name
     * @returns {Array} Array of square IDs in the region
     */
    getSquaresByRegion(region) {
        const squares = [];
        for (const [squareId, data] of this.squareData) {
            if (data.region === region) {
                squares.push(squareId);
            }
        }
        return squares;
    }
    
    /**
     * Get all squares with at least one explorable quadrant
     * @returns {Array} Array of square IDs with explorable quadrants
     */
    getSquaresWithExplorableQuadrants() {
        const squares = [];
        for (const [squareId, data] of this.squareData) {
            if (data.quadrants.some(q => q.status === 'explorable')) {
                squares.push(squareId);
            }
        }
        return squares;
    }
    
    /**
     * Get all squares with only inaccessible quadrants
     * @returns {Array} Array of square IDs with only inaccessible quadrants
     */
    getSquaresWithOnlyInaccessibleQuadrants() {
        const squares = [];
        for (const [squareId, data] of this.squareData) {
            if (data.quadrants.every(q => q.status === 'inaccessible')) {
                squares.push(squareId);
            }
        }
        return squares;
    }
    
    /**
     * Get all available regions
     * @returns {Array} Array of unique region names
     */
    getRegions() {
        const regions = new Set();
        for (const data of this.squareData.values()) {
            regions.add(data.region);
        }
        return Array.from(regions);
    }
    
    /**
     * Check if a square has any explorable quadrants
     * @param {string} squareId - Square ID like "E4"
     * @returns {boolean} True if square has at least one explorable quadrant
     */
    hasExplorableQuadrants(squareId) {
        const metadata = this.getSquareMetadata(squareId);
        return metadata ? metadata.quadrants.some(q => q.status === 'explorable') : false;
    }
    
    /**
     * Check if a square has only inaccessible quadrants
     * @param {string} squareId - Square ID like "E4"
     * @returns {boolean} True if all quadrants are inaccessible
     */
    hasOnlyInaccessibleQuadrants(squareId) {
        const metadata = this.getSquareMetadata(squareId);
        return metadata ? metadata.quadrants.every(q => q.status === 'inaccessible') : true;
    }
    
    /**
     * Get region for a square
     * @param {string} squareId - Square ID like "E4"
     * @returns {string|null} Region name or null if not found
     */
    getRegion(squareId) {
        const metadata = this.getSquareMetadata(squareId);
        return metadata ? metadata.region : null;
    }
    
    /**
     * Get status for a square (used by MapGeometry / MapEngine)
     * @param {string} squareId - Square ID like "E4"
     * @returns {string|null} "Explorable", "Inaccessible", or null if not found
     */
    getStatus(squareId) {
        const metadata = this.getSquareMetadata(squareId);
        if (!metadata) return null;
        const hasExplorable = metadata.quadrants && metadata.quadrants.some(q => q.status === 'explorable');
        return hasExplorable ? 'Explorable' : 'Inaccessible';
    }
    
    /**
     * Check if a square has any explorable quadrants (used by MapGeometry)
     * @param {string} squareId - Square ID like "E4"
     * @returns {boolean} True if square has at least one explorable quadrant
     */
    isExplorable(squareId) {
        return this.hasExplorableQuadrants(squareId);
    }
    
    /**
     * Check if a square has only inaccessible quadrants (used by MapGeometry)
     * @param {string} squareId - Square ID like "E4"
     * @returns {boolean} True if all quadrants are inaccessible
     */
    isInaccessible(squareId) {
        return this.hasOnlyInaccessibleQuadrants(squareId);
    }
    
    /**
     * Get all squares with a specific status (used by MapEngine)
     * @param {string} status - "Explorable" or "Inaccessible"
     * @returns {Array<string>} Array of square IDs
     */
    getSquaresByStatus(status) {
        const normalized = (status || '').toLowerCase();
        if (normalized === 'explorable') {
            return this.getSquaresWithExplorableQuadrants();
        }
        if (normalized === 'inaccessible') {
            return this.getSquaresWithOnlyInaccessibleQuadrants();
        }
        return [];
    }
    
    /**
     * Get quadrant data for a square
     * @param {string} squareId - Square ID like "E4"
     * @returns {Array|null} Array of quadrant data or null if not found
     */
    getQuadrants(squareId) {
        const metadata = this.getSquareMetadata(squareId);
        return metadata ? metadata.quadrants : null;
    }
    
    /**
     * Check if a specific quadrant is blighted
     * @param {string} squareId - Square ID like "E4"
     * @param {number} quadrant - Quadrant number (1-4)
     * @returns {boolean} True if quadrant is blighted
     */
    isQuadrantBlighted(squareId, quadrant) {
        const quadrants = this.getQuadrants(squareId);
        if (!quadrants) return false;
        
        const quadrantData = quadrants.find(q => q.quadrantId === `Q${quadrant}`);
        return quadrantData ? quadrantData.blighted : false;
    }
    
    /**
     * Check if a specific quadrant is explorable
     * @param {string} squareId - Square ID like "E4"
     * @param {number} quadrant - Quadrant number (1-4)
     * @returns {boolean} True if quadrant is explorable
     */
    isQuadrantExplorable(squareId, quadrant) {
        const quadrants = this.getQuadrants(squareId);
        if (!quadrants) return false;
        
        const quadrantData = quadrants.find(q => q.quadrantId === `Q${quadrant}`);
        return quadrantData ? quadrantData.status === 'explorable' : false;
    }
    
    /**
     * Get the status of a specific quadrant
     * @param {string} squareId - Square ID like "E4"
     * @param {number} quadrant - Quadrant number (1-4)
     * @returns {string|null} Status of the quadrant or null if not found
     */
    getQuadrantStatus(squareId, quadrant) {
        const quadrants = this.getQuadrants(squareId);
        if (!quadrants) return null;
        
        const quadrantData = quadrants.find(q => q.quadrantId === `Q${quadrant}`);
        return quadrantData ? quadrantData.status : null;
    }
    
    /**
     * Get all explorable quadrants for a square
     * @param {string} squareId - Square ID like "E4"
     * @returns {Array} Array of explorable quadrant IDs
     */
    getExplorableQuadrants(squareId) {
        const quadrants = this.getQuadrants(squareId);
        if (!quadrants) return [];
        
        return quadrants
            .filter(q => q.status === 'explorable')
            .map(q => q.quadrantId);
    }
    
    /**
     * Get all blighted quadrants for a square
     * @param {string} squareId - Square ID like "E4"
     * @returns {Array} Array of blighted quadrant IDs
     */
    getBlightedQuadrants(squareId) {
        const quadrants = this.getQuadrants(squareId);
        if (!quadrants) return [];
        
        return quadrants
            .filter(q => q.blighted)
            .map(q => q.quadrantId);
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MapMetadata;
}