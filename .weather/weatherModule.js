const weatherWeightModifiers = {
    Rudania: {
      Winter: {
        temperature: {
          "24°F / -4°C - Cold": 0.4,
          "36°F / 2°C - Chilly": 0.6,
          "44°F / 6°C - Brisk": 1,
          "52°F / 11°C - Cool": 1.2,
          "61°F / 16°C - Mild": 1.4,
          "72°F / 22°C - Perfect": 1.5
        },
        precipitation: {
          "Snow": 0.3,
          "Light Snow": 0.3,
          "Sunny": 1.5,
          "Fog": 1.2,
          "Cinder Storm": 1.2
        }
      },
      Summer: {
        temperature: {
          "89°F / 32°C - Hot": 1.5,
          "97°F / 36°C - Scorching": 2,
          "100°F / 38°C - Heat Wave": 2
        },
        precipitation: {
          "Cinder Storm": 2,
          "Sunny": 1.4,
          "Rain": 0.8
        }
      },
      Spring: {
        temperature: {
          "61°F / 16°C - Mild": 1.2,
          "72°F / 22°C - Perfect": 1.3,
          "82°F / 28°C - Warm": 1.1
        },
        precipitation: {
          "Cinder Storm": 1.5,
          "Sunny": 1.2
        }
      },
      Autumn: {
        temperature: {
          "52°F / 11°C - Cool": 1.1,
          "61°F / 16°C - Mild": 1.3,
          "72°F / 22°C - Perfect": 1.4
        },
        precipitation: {
          "Cinder Storm": 1.2,
          "Fog": 1.3
        }
      }
    },
  
    Inariko: {
        Winter: {
          temperature: {
            "0°F / -18°C - Frigid": 1.2,
            "8°F / -14°C - Freezing": 1.2,
            "24°F / -4°C - Cold": 1.3,
            "36°F / 2°C - Chilly": 1,
            "44°F / 6°C - Brisk": 0.8
          },
          precipitation: {
            "Blizzard": 1.4,
            "Heavy Snow": 1.5,
            "Snow": 1.4,
            "Fog": 1.3
          }
        },
        Spring: {
          temperature: {
            "44°F / 6°C - Brisk": 1.2,
            "52°F / 11°C - Cool": 1.2,
            "61°F / 16°C - Mild": 1,
            "72°F / 22°C - Perfect": 0.8
          },
          precipitation: {
            "Fog": 1.3,
            "Rain": 1.2,
            "Cloudy": 1.2
          },
        special: {
          "Flower Bloom": 1.8
         }
        },
        Summer: {
          temperature: {
            "61°F / 16°C - Mild": 1.2,
            "72°F / 22°C - Perfect": 1,
            "82°F / 28°C - Warm": 0.8
          },
          precipitation: {
            "Rain": 1.2,
            "Thunderstorm": 1.3,
            "Fog": 1.1
        },
        special: {
          "Flower Bloom": 1.4
         }
        },
        Autumn: {
          temperature: {
            "36°F / 2°C - Chilly": 1.2,
            "44°F / 6°C - Brisk": 1.2,
            "52°F / 11°C - Cool": 1.1
          },
          precipitation: {
            "Fog": 1.3,
            "Snow": 1.2,
            "Cloudy": 1.2
          }
        }
      },
    
      Vhintl: {
        Winter: {
          temperature: {
            "36°F / 2°C - Chilly": 1.2,
            "44°F / 6°C - Brisk": 1.2,
            "52°F / 11°C - Cool": 1.1
          },
          precipitation: {
            "Fog": 1.5,
            "Rain": 1.3,
            "Light Snow": 0.4,
            "Thundersnow": 0.3
          }
        },
        Spring: {
            temperature: {
              "61°F / 16°C - Mild": 1.2,
              "72°F / 22°C - Perfect": 1.3,
              "82°F / 28°C - Warm": 1.2
            },
            precipitation: {
              "Rain": 1.3,
              "Thunderstorm": 1.5,
              "Fog": 1.3
            },
            special: {
              "Muggy": 1.4
            }
          },
          Summer: {
            temperature: {
              "82°F / 28°C - Warm": 1.4,
              "89°F / 32°C - Hot": 1.2,
              "97°F / 36°C - Scorching": 0.8
            },
            precipitation: {
              "Thunderstorm": 2,
              "Heavy Rain": 1.5,
              "Fog": 1.2
            },
            special: {
              "Muggy": 1.8
            }
          },
        Autumn: {
          temperature: {
            "61°F / 16°C - Mild": 1.2,
            "72°F / 22°C - Perfect": 1.2
          },
          precipitation: {
            "Fog": 1.4,
            "Rain": 1.3,
            "Thunderstorm": 1.4
          }
        }
      }
    };
    
    module.exports = weatherWeightModifiers;
    