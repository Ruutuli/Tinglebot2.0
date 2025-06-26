/* ============================================================================ */
/* Stats Dashboard Script                                                       */
/* Handles initialization and rendering of character statistics charts,        */
/* activity logs, and navigation between dashboard and stats sections.         */
/* ============================================================================ */

// Chart.js is loaded globally via CDN in index.html
// Register ChartDataLabels plugin if available
if (typeof ChartDataLabels !== 'undefined') {
    Chart.register(ChartDataLabels);
}

// ============================================================================
// ------------------- State: Chart Instances -------------------
// Stores chart instances for reuse or cleanup
// ============================================================================
let villageChart = null;
let raceChart = null;
let jobChart = null;

// ============================================================================
// ------------------- Chart Creation Functions -------------------
// ============================================================================

// ------------------- Function: createBarChart -------------------
// Creates a bar chart with modern styling and rounded bars
function createBarChart(ctx, data, options = {}) {
    const {
      labelTransform = v => v,
      colors = ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF'],
      yMax = null
    } = options;
  
    const labels = Object.keys(data).map(labelTransform);
    const values = Object.values(data);
  
    const chartConfig = {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          data: values,
          backgroundColor: colors,
          borderRadius: 8, // Rounded bars
          barPercentage: 0.75,     // Wider bars (was 0.6)
          categoryPercentage: 0.85 // Less spacing between groups (was 0.7)          
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: {
          padding: { top: 10, bottom: 10 }
        },
        plugins: {
          legend: { display: false },
          title: {
            display: false
          },
          tooltip: {
            backgroundColor: '#333',
            titleColor: '#fff',
            bodyColor: '#ddd',
            borderColor: '#555',
            borderWidth: 1
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            max: yMax,
            ticks: {
              color: '#FFFFFF',
              font: { size: 12 }
            },
            grid: {
              color: 'rgba(255, 255, 255, 0.1)'
            }
          },
          x: {
            ticks: {
              color: '#FFFFFF',
              font: { size: 12 }
            },
            grid: {
              display: false
            }
          }
        },
        animation: {
          duration: 800,
          easing: 'easeOutQuart'
        }
      }
    };

    // Add datalabels plugin if available
    if (typeof ChartDataLabels !== 'undefined') {
      chartConfig.options.plugins.datalabels = {
        anchor: 'end',
        align: 'top',
        color: '#FFFFFF',
        font: {
          weight: 'bold',
          size: 12
        },
        formatter: value => value
      };
      chartConfig.plugins = [ChartDataLabels];
    }
  
    return new Chart(ctx, chartConfig);
  }
  

// ============================================================================
// ------------------- Initialization: Stats Page -------------------
// Loads and renders character stats data
// ============================================================================

// ------------------- Function: initStatsPage -------------------
// Fetches stats data and initializes all charts
async function initStatsPage() {
    try {
        const res = await fetch('/api/stats/characters');
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);

        const data = await res.json();
        if (!data) throw new Error('No data received');

        const totalCard = document.getElementById('stats-total-characters');
        const totalCardHeader = totalCard.closest('.stats-card')?.querySelector('h3');
        if (totalCardHeader) totalCardHeader.textContent = 'Character Stats';
        totalCard.textContent = '';

        const totalCardParent = totalCard.closest('.stats-card');
        if (totalCardParent) {
            let extraStats = totalCardParent.querySelector('.extra-stats');
            if (extraStats) extraStats.remove();

            extraStats = document.createElement('div');
            extraStats.className = 'extra-stats';
            extraStats.style.marginTop = '1.5rem';
            extraStats.innerHTML = `
                <ul style="list-style:none; padding:0; margin:0; color:#ccc; font-size:1.05rem;">
                    <li><strong>Total Characters:</strong> ${data.totalCharacters || 0}</li>
                    <li><strong>KO'd:</strong> ${data.kodCount || 0}</li>
                    <li><strong>Blighted:</strong> ${data.blightedCount || 0}</li>
                    <li><strong>Most Stamina:</strong> ${(data.mostStaminaChar?.names?.join(', ') || '—')} (${data.mostStaminaChar?.value || 0})</li>
                    <li><strong>Most Hearts:</strong> ${(data.mostHeartsChar?.names?.join(', ') || '—')} (${data.mostHeartsChar?.value || 0})</li>
                    <li><strong>Most Spirit Orbs:</strong> ${(data.mostOrbsChar?.names?.join(', ') || '—')} (${data.mostOrbsChar?.value || 0})</li>
                </ul>
                <div style="margin-top:1.2rem;">
                    <strong>Upcoming Birthdays:</strong>
                    <ul style="list-style:none; padding:0; margin:0; color:#ccc;">
                        ${(data.upcomingBirthdays || []).length
                            ? data.upcomingBirthdays.map(b => `<li>${b.name} <span style='color:#aaa;'>(${b.birthday})</span></li>`).join('')
                            : '<li>None in next 30 days</li>'
                        }
                    </ul>
                </div>
                <div style="margin-top:1.2rem;">
                    <strong>Visiting:</strong>
                    <ul style="list-style:none; padding:0; margin:0; color:#ccc;">
                        <li>Inariko: ${data.visitingCounts?.inariko || 0}</li>
                        <li>Rudania: ${data.visitingCounts?.rudania || 0}</li>
                        <li>Vhintl: ${data.visitingCounts?.vhintl || 0}</li>
                    </ul>
                </div>
            `;
            totalCardParent.appendChild(extraStats);
        }

        if (villageChart) villageChart.destroy();
        if (raceChart) raceChart.destroy();
        if (jobChart) jobChart.destroy();

        // --- Chart: Village Distribution ---
        const villageCtx = document.getElementById('villageDistributionChart').getContext('2d');
        const villageData = data.charactersPerVillage || {};
        villageChart = createBarChart(villageCtx, villageData, {
            labelTransform: v => v.charAt(0).toUpperCase() + v.slice(1),
            colors: ['#EF9A9A', '#9FB7F2', '#98D8A7']
        });

        // --- Chart: Race Distribution ---
        const raceCtx = document.getElementById('raceDistributionChart').getContext('2d');
        const raceEntries = Object.entries(data.charactersPerRace || {}).sort((a, b) => a[0].localeCompare(b[0]));
        const raceData = Object.fromEntries(raceEntries);
        raceChart = createBarChart(raceCtx, raceData, {
            colors: [
                '#FF9999', '#FFD27A', '#FFF066', '#A6F29A', '#6EEEDD', '#8FCBFF',
                '#B89CFF', '#F78CD2', '#8CE6C0', '#FFDB66', '#BFBFBF'
              ]
        });

        // --- Chart: Job Distribution ---
        const jobCtx = document.getElementById('jobDistributionChart').getContext('2d');
        const jobEntries = Object.entries(data.charactersPerJob || {})
            .filter(([job, count]) => job && typeof count === 'number' && count > 0)
            .sort((a, b) => a[0].localeCompare(b[0]));
        const jobData = Object.fromEntries(jobEntries);

        if (Object.keys(jobData).length === 0) {
            document.querySelector('#jobDistributionChart').parentElement.innerHTML =
                '<div style="text-align: center; color: #FFFFFF; padding: 20px;">No job data available</div>';
        } else {
            jobChart = createBarChart(jobCtx, jobData, {
                colors: [
                    '#FF9999', '#FFD27A', '#FFF066', '#A6F29A', '#6EEEDD',
                    '#8FCBFF', '#B89CFF', '#F78CD2', '#8CE6C0', '#FFDB66',
                    '#BFBFBF', '#D6AEFA', '#7BEFC3', '#FFC3A0', '#AAB6FF', '#FFB3B3'
                  ],
                yMax: 15
            });
        }
    } catch (err) {
        document.getElementById('stats-total-characters').textContent = 'Error';
        console.error('Error loading stats:', err);
    }
}

// ============================================================================
// ------------------- Exports -------------------
// Shared functions for use in other modules
// ============================================================================
export {
    initStatsPage
};
