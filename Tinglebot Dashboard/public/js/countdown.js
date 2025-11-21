// ============================================================================
// countdown.js — Dashboard Countdown Timer Functionality
// Handles countdown timers for scheduled events like daily resets, Blood Moon, etc.
// ============================================================================

class CountdownManager {
  constructor() {
    this.timers = {};
    this.updateInterval = null;
    
    // Blood Moon dates from calendarModule.js (26-day cycle)
    this.bloodmoonDates = [
      { realDate: '01-13', month: 'Yowaka Ita', day: 13 },
      { realDate: '02-08', month: 'Noe Rajee', day: 13 },
      { realDate: '03-06', month: 'Ha Dahamar', day: 13 },
      { realDate: '04-01', month: 'Shae Katha', day: 13 },
      { realDate: '04-27', month: 'Keo Ruug', day: 13 }, 
      { realDate: '05-23', month: 'Gee Ha\'rah', day: 13 },
      { realDate: '06-18', month: 'Jitan Sa\'mi', day: 13 },
      { realDate: '07-14', month: 'Sha Warvo', day: 13 },
      { realDate: '08-09', month: 'Tutsuwa Nima', day: 13 },
      { realDate: '09-04', month: 'Shae Mo\'sah', day: 13 },
      { realDate: '09-30', month: 'Hawa Koth', day: 13 },
      { realDate: '10-26', month: 'Maka Rah', day: 13 },
      { realDate: '11-21', month: 'Ya Naga', day: 13 },
      { realDate: '12-17', month: 'Etsu Korima', day: 13 }
    ];
    
    this.events = [
      {
        id: 'daily-reset',
        name: 'Daily Reset',
        time: '08:00',
        description: 'Weather updates, stamina recovery, daily rolls reset',
        icon: 'fas fa-sun',
        type: 'primary',
        isDaily: true
      },
      {
        id: 'blood-moon',
        name: 'Blood Moon',
        description: 'Channel renaming, Blood Moon announcements',
        icon: 'fas fa-moon',
        type: 'warning',
        isDaily: false
      },
      {
        id: 'blight-roll',
        name: 'Blight Roll Call',
        time: '20:00',
        description: 'Blight roll submissions and missed rolls check',
        icon: 'fas fa-dice-d20',
        type: 'danger',
        isDaily: true
      },
      {
        id: 'cleanup',
        name: 'Midnight Cleanup',
        time: '00:00',
        description: 'Jail releases, debuff expiry, request cleanup',
        icon: 'fas fa-broom',
        type: 'info',
        isDaily: true
      }
    ];
    
    this.init();
  }

  init() {
    this.updateCountdowns();
    this.updateEventsList();
    
    // Update countdowns every second
    this.updateInterval = setInterval(() => {
      this.updateCountdowns();
    }, 1000);
    
    // Update events list every minute
    setInterval(() => {
      this.updateEventsList();
    }, 60000);
      
  }

  getNextBloodMoonDate() {
    const now = new Date();
    const currentDate = now.toLocaleString("en-US", { timeZone: "America/New_York" });
    const currentDateStr = new Date(currentDate).toISOString().slice(5, 10); // MM-DD format
    
    // Find the next Blood Moon date
    let nextBloodMoon = null;
    
    // First, check if there's a Blood Moon today
    const todayBloodMoon = this.bloodmoonDates.find(bm => bm.realDate === currentDateStr);
    if (todayBloodMoon) {
      // If it's Blood Moon today, set it to 8 PM today
      const today = new Date(currentDate);
      today.setHours(20, 0, 0, 0);
      return today;
    }
    
    // Find the next Blood Moon date
    for (let i = 0; i < this.bloodmoonDates.length; i++) {
      const bloodMoon = this.bloodmoonDates[i];
      const bloodMoonDate = new Date(`${new Date().getFullYear()}-${bloodMoon.realDate}`);
      
      // If this Blood Moon date is in the future, it's our next one
      if (bloodMoonDate > new Date(currentDate)) {
        bloodMoonDate.setHours(20, 0, 0, 0); // Set to 8 PM
        nextBloodMoon = bloodMoonDate;
        break;
      }
    }
    
    // If no Blood Moon found this year, get the first one next year
    if (!nextBloodMoon) {
      const nextYear = new Date().getFullYear() + 1;
      const firstBloodMoon = this.bloodmoonDates[0];
      const nextYearBloodMoon = new Date(`${nextYear}-${firstBloodMoon.realDate}`);
      nextYearBloodMoon.setHours(20, 0, 0, 0);
      nextBloodMoon = nextYearBloodMoon;
    }
    
    return nextBloodMoon;
  }

  getTimeUntilNext(targetTime, isDaily = true) {
    const now = new Date();
    const estNow = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
    
    let targetDate;
    
    if (isDaily) {
      // Parse target time (HH:MM format)
      const [targetHour, targetMinute] = targetTime.split(':').map(Number);
      
      // Set target time to today
      targetDate = new Date(estNow);
      targetDate.setHours(targetHour, targetMinute, 0, 0);
      
      // If it's already past the target time today, set to tomorrow
      if (estNow >= targetDate) {
        targetDate.setDate(targetDate.getDate() + 1);
      }
    } else {
      // For non-daily events (like Blood Moon), use the calculated date
      targetDate = this.getNextBloodMoonDate();
    }
    
    const timeDiff = targetDate - estNow;
    
    const hours = Math.floor(timeDiff / (1000 * 60 * 60));
    const minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((timeDiff % (1000 * 60)) / 1000);
    
    return { hours, minutes, seconds, targetDate };
  }

  updateCountdowns() {
    this.events.forEach(event => {
      const { hours, minutes, seconds } = this.getTimeUntilNext(event.time, event.isDaily);
      
      // For Blood Moon, calculate days and hours instead of hours, minutes, seconds
      if (event.id === 'blood-moon') {
        const totalHours = hours + (minutes / 60) + (seconds / 3600);
        const days = Math.floor(totalHours / 24);
        const remainingHours = Math.floor(totalHours % 24);
        
        // Update timer elements for Blood Moon
        const daysEl = document.getElementById('blood-moon-days');
        const hoursEl = document.getElementById('blood-moon-hours');
        
        if (daysEl) daysEl.textContent = days.toString().padStart(2, '0');
        if (hoursEl) hoursEl.textContent = remainingHours.toString().padStart(2, '0');
      } else {
        // Update timer elements for other events
        const hoursEl = document.getElementById(`${event.id}-hours`);
        const minutesEl = document.getElementById(`${event.id}-minutes`);
        const secondsEl = document.getElementById(`${event.id}-seconds`);
        
        if (hoursEl) hoursEl.textContent = hours.toString().padStart(2, '0');
        if (minutesEl) minutesEl.textContent = minutes.toString().padStart(2, '0');
        if (secondsEl) secondsEl.textContent = seconds.toString().padStart(2, '0');
      }
      
      // Add pulse animation when less than 1 hour remaining (or 1 day for Blood Moon)
      const timerEl = document.getElementById(`${event.id}-timer`);
      if (timerEl) {
        if (event.id === 'blood-moon') {
          const totalHours = hours + (minutes / 60) + (seconds / 3600);
          if (totalHours < 24) { // Less than 1 day remaining
            timerEl.classList.add('pulse-warning');
          } else {
            timerEl.classList.remove('pulse-warning');
          }
        } else {
          if (hours === 0 && minutes < 60) {
            timerEl.classList.add('pulse-warning');
          } else {
            timerEl.classList.remove('pulse-warning');
          }
        }
      }
    });
  }

  updateEventsList() {
    const eventsListEl = document.getElementById('events-list');
    if (!eventsListEl) return;
    
    // Sort events by next occurrence
    const sortedEvents = this.events.map(event => {
      const { targetDate } = this.getTimeUntilNext(event.time, event.isDaily);
      return { ...event, nextOccurrence: targetDate };
    }).sort((a, b) => a.nextOccurrence - b.nextOccurrence);
    
    // Generate HTML for events list
    const eventsHTML = sortedEvents.map(event => {
      const timeString = event.nextOccurrence.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: 'America/New_York'
      });
      
      const dateString = event.nextOccurrence.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        timeZone: 'America/New_York'
      });
      
      // For Blood Moon, show the date as well
      const displayTime = event.id === 'blood-moon' ? `${dateString} at ${timeString}` : timeString;
      
      return `
        <div class="countdown-event-item">
          <div class="countdown-event-icon">
            <i class="${event.icon}"></i>
          </div>
          <div class="countdown-event-details">
            <div class="countdown-event-name">${event.name}</div>
            <div class="countdown-event-time">${displayTime} EST</div>
            <div class="countdown-event-description">${event.description}</div>
          </div>
        </div>
      `;
    }).join('');
    
    eventsListEl.innerHTML = eventsHTML;
  }

  destroy() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
  }
}

// Initialize countdown manager when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  // Only initialize if we're on the dashboard section
  const dashboardSection = document.getElementById('dashboard-section');
  if (dashboardSection && dashboardSection.style.display !== 'none') {
    window.countdownManager = new CountdownManager();
  }
});

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CountdownManager;
}
// Expose CountdownManager globally for browser usage
window.CountdownManager = CountdownManager; 