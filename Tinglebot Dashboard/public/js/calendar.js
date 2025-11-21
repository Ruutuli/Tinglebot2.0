// ============================================================================
// Calendar Module - Handles birthdays, Hyrulean calendar, and Blood Moon
// ============================================================================

class CalendarModule {
  constructor() {
    this.currentTab = 'monthly';
    this.currentDate = new Date();
    this.birthdays = [];
    this.hyruleanCalendar = [];
    this.bloodmoonDates = [];
    this.init();
  }

  async init() {
    this.setupEventListeners();
    await this.loadCalendarData();
    this.updateOverview();
    // Force render the calendar after initialization
    this.renderMonthlyCalendar();
  }

  setupEventListeners() {
    // Tab switching
    const tabButtons = document.querySelectorAll('.calendar-tab');
    tabButtons.forEach(button => {
      button.addEventListener('click', () => {
        const tab = button.getAttribute('data-tab');
        this.switchTab(tab);
      });
    });

    // Calendar navigation
    const prevMonthBtn = document.getElementById('prev-month');
    const nextMonthBtn = document.getElementById('next-month');
    const todayBtn = document.getElementById('today-btn');

    if (prevMonthBtn) {
      prevMonthBtn.addEventListener('click', () => {
        this.currentDate.setMonth(this.currentDate.getMonth() - 1);
        this.renderMonthlyCalendar();
      });
    }

    if (nextMonthBtn) {
      nextMonthBtn.addEventListener('click', () => {
        this.currentDate.setMonth(this.currentDate.getMonth() + 1);
        this.renderMonthlyCalendar();
      });
    }

    if (todayBtn) {
      todayBtn.addEventListener('click', () => {
        this.currentDate = new Date();
        this.renderMonthlyCalendar();
      });
    }

    // Handle window resize to regenerate calendar for mobile/desktop
    window.addEventListener('resize', () => {
      this.renderMonthlyCalendar();
    });

    // Retry button for errors
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('calendar-retry-btn')) {
        this.loadCalendarData();
      }
    });
  }

  switchTab(tab) {
    // Update active tab button
    document.querySelectorAll('.calendar-tab').forEach(btn => {
      btn.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tab}"]`).classList.add('active');

    // Update active tab content
    document.querySelectorAll('.calendar-tab-content').forEach(content => {
      content.classList.remove('active');
    });
    document.getElementById(`${tab}-tab`).classList.add('active');

    this.currentTab = tab;
    this.loadTabContent(tab);
  }

  async loadCalendarData() {
    try {
      
      // Load Hyrulean calendar data and birthdays from calendar endpoint
      const calendarResponse = await fetch('/api/calendar');
      if (calendarResponse.ok) {
        const calendarData = await calendarResponse.json();
        this.hyruleanCalendar = calendarData.hyruleanCalendar || [];
        this.bloodmoonDates = calendarData.bloodmoonDates || [];
        this.birthdays = calendarData.birthdays || [];
        
      }

      this.loadTabContent(this.currentTab);
      this.updateOverview(); // Update overview after data is loaded
    } catch (error) {
      console.error('❌ Error loading calendar data:', error);
      this.showError('Failed to load calendar data');
    }
  }

  loadTabContent(tab) {
    switch (tab) {
      case 'monthly':
        this.renderMonthlyCalendar();
        break;
      case 'birthdays':
        this.renderBirthdays();
        break;
      case 'hyrulean':
        this.renderHyruleanCalendar();
        break;
      case 'bloodmoon':
        this.renderBloodMoon();
        break;
    }
  }

  updateOverview() {
    const today = new Date();
    const todayFormatted = today.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });

    // Update today's date
    const todayElement = document.getElementById('today-date');
    if (todayElement) {
      todayElement.textContent = todayFormatted;
    }

    // Update Hyrulean date (full date with month and day)
    const hyruleanMonthElement = document.getElementById('hyrulean-month');
    if (hyruleanMonthElement) {
      const hyruleanDate = this.convertToHyruleanDate(today);
      hyruleanMonthElement.textContent = hyruleanDate;
    }

    // Update Blood Moon cycle
    const bloodMoonCycleElement = document.getElementById('blood-moon-cycle');
    if (bloodMoonCycleElement) {
      const cycleDay = this.getCurrentBloodMoonCycleDay(today);
      const isTodayBloodmoon = this.bloodmoonDates.some(
        bloodmoon => bloodmoon.realDate === this.formatDateMMDD(today)
      );
      
      if (cycleDay) {
        if (isTodayBloodmoon) {
          bloodMoonCycleElement.textContent = 'Blood Moon (Day 1)';
        } else {
          const daysUntilNext = 26 - cycleDay + 1;
          bloodMoonCycleElement.textContent = `Day ${cycleDay} (${daysUntilNext} days until next)`;
        }
      } else {
        bloodMoonCycleElement.textContent = 'Unknown';
      }
    }
  }

  getCurrentHyruleanMonth(date) {
    const formattedDate = this.formatDateMMDD(date);
    return this.hyruleanCalendar.find(month => {
      // Handle date ranges that cross month boundaries
      const startMonth = parseInt(month.start.split('-')[0]);
      const startDay = parseInt(month.start.split('-')[1]);
      const endMonth = parseInt(month.end.split('-')[0]);
      const endDay = parseInt(month.end.split('-')[1]);
      
      const currentMonth = parseInt(formattedDate.split('-')[0]);
      const currentDay = parseInt(formattedDate.split('-')[1]);
      
      // If the range is within the same month
      if (startMonth === endMonth) {
        return currentMonth === startMonth && currentDay >= startDay && currentDay <= endDay;
      }
      
      // If the range crosses month boundaries (e.g., 09-18 to 10-13)
      if (startMonth < endMonth) {
        // Check if we're in the start month and after the start day
        if (currentMonth === startMonth && currentDay >= startDay) {
          return true;
        }
        // Check if we're in the end month and before the end day
        if (currentMonth === endMonth && currentDay <= endDay) {
          return true;
        }
        // Check if we're in any month between start and end
        if (currentMonth > startMonth && currentMonth < endMonth) {
          return true;
        }
      }
      
      return false;
    });
  }

  getCurrentBloodMoonCycleDay(date) {
    const formattedDate = this.formatDateMMDD(date);
    
    // First, check if today is a Blood Moon day
    const isTodayBloodmoon = this.bloodmoonDates.some(
      bloodmoon => bloodmoon.realDate === formattedDate
    );
    
    if (isTodayBloodmoon) {
      return 1; // Blood Moon day is always Day 1
    }
    
    // Find the most recent Blood Moon date
    let mostRecentBloodmoon = null;
    let daysSinceBloodmoon = Infinity;
    
    for (const bloodmoon of this.bloodmoonDates) {
      const bloodmoonDate = new Date(date.getFullYear(), 
        parseInt(bloodmoon.realDate.split('-')[0]) - 1, 
        parseInt(bloodmoon.realDate.split('-')[1]));
      
      // If this Blood Moon hasn't happened yet this year, check last year
      if (bloodmoonDate > date) {
        bloodmoonDate.setFullYear(date.getFullYear() - 1);
      }
      
      const daysDiff = Math.floor((date - bloodmoonDate) / (1000 * 60 * 60 * 24));
      
      if (daysDiff >= 0 && daysDiff < daysSinceBloodmoon) {
        daysSinceBloodmoon = daysDiff;
        mostRecentBloodmoon = bloodmoon;
      }
    }
    
    if (mostRecentBloodmoon) {
      // Calculate cycle day (Blood Moon cycle is 26 days)
      // Day 1 is the Blood Moon, so we add 1 to the remainder
      const cycleDay = (daysSinceBloodmoon % 26) + 1;
      return cycleDay;
    }
    
    return null;
  }

  formatDateMMDD(date) {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${month}-${day}`;
  }

  getDayOfYear(date) {
    const start = new Date(date.getFullYear(), 0, 0);
    const diff = date - start;
    const oneDay = 1000 * 60 * 60 * 24;
    return Math.floor(diff / oneDay);
  }

  renderBirthdays() {
    const container = document.getElementById('birthdays-list');
    if (!container) return;

    if (this.birthdays.length === 0) {
      container.innerHTML = `
        <div class="birthdays-empty">
          <i class="fas fa-birthday-cake"></i>
          <h4>No Upcoming Birthdays</h4>
          <p>No birthdays scheduled for the next 30 days</p>
        </div>
      `;
      return;
    }

    const today = new Date();
    const thisYear = today.getFullYear();
    const todayMMDD = this.formatDateMMDD(today);

    // Calculate upcoming birthdays (next 10 birthdays)
    const upcomingBirthdays = this.birthdays.map(birthday => {
      const [month, day] = birthday.birthday.split('-');
      let nextBirthday = new Date(thisYear, parseInt(month) - 1, parseInt(day));
      
      // If birthday has passed this year, set it to next year
      if (nextBirthday < today) {
        nextBirthday.setFullYear(thisYear + 1);
      }
      
      const daysUntil = Math.ceil((nextBirthday - today) / (1000 * 60 * 60 * 24));
      
      return {
        ...birthday,
        nextBirthday,
        daysUntil
      };
    })
    .sort((a, b) => a.daysUntil - b.daysUntil)
    .slice(0, 10); // Take only the next 10 birthdays

    if (upcomingBirthdays.length === 0) {
      container.innerHTML = `
        <div class="birthdays-empty">
          <i class="fas fa-birthday-cake"></i>
          <h4>No Upcoming Birthdays</h4>
          <p>No birthdays found in the system</p>
        </div>
      `;
      return;
    }

    const birthdayHTML = upcomingBirthdays.map(birthday => {
      const birthdayMMDD = this.formatDateMMDD(birthday.nextBirthday);
      const isToday = birthdayMMDD === todayMMDD;
      const hyruleanDate = this.convertToHyruleanDate(birthday.nextBirthday);
      
      return `
        <div class="birthday-item ${isToday ? 'today' : ''}">
          <div class="birthday-avatar">
            ${birthday.icon ? `<img src="${birthday.icon}" alt="${birthday.name}" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';" />` : ''}
            <i class="fas fa-user" style="${birthday.icon ? 'display: none;' : 'display: block;'}"></i>
          </div>
          <div class="birthday-info">
            <div class="birthday-name">${birthday.name}</div>
            <div class="birthday-date">${birthdayMMDD}</div>
            <div class="birthday-hyrulean-date">${hyruleanDate}</div>
          </div>
          <div class="birthday-days">
            ${isToday ? 'Today!' : `${birthday.daysUntil} days`}
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = birthdayHTML;
  }

  renderMonthlyCalendar() {
    
    // Update header
    const monthYearElement = document.getElementById('current-month-year');
    const hyruleanDateElement = document.getElementById('current-hyrulean-date');
    
    if (monthYearElement) {
      monthYearElement.textContent = this.currentDate.toLocaleDateString('en-US', { 
        month: 'long', 
        year: 'numeric' 
      });
    }
    
    if (hyruleanDateElement) {
      const hyruleanDate = this.convertToHyruleanDate(this.currentDate);
      hyruleanDateElement.textContent = hyruleanDate;
    }
    
    // Generate calendar grid
    this.generateCalendarGrid();
    
    // Generate events list
    this.generateEventsList();
  }

  generateCalendarGrid() {
    const container = document.getElementById('calendar-days');
    const weekdaysContainer = document.querySelector('.calendar-weekdays');
    if (!container || !weekdaysContainer) return;
    
    const year = this.currentDate.getFullYear();
    const month = this.currentDate.getMonth();
    const today = new Date();
    
    // Check if we should use mobile or desktop layout
    if (window.innerWidth <= 768) {
      this.generateMobileList(container, year, month, today);
    } else {
      this.generateDesktopGrid(container, weekdaysContainer, year, month, today);
    }
  }

  generateMobileList(container, year, month, today) {
    // Get first day of month and last day of month
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    
    let calendarHTML = '';
    
    // Clear any existing content first
    container.innerHTML = '';
    
    // Generate all days of the month in a list format
    for (let day = 1; day <= lastDay.getDate(); day++) {
      const currentDate = new Date(year, month, day);
      const isToday = currentDate.toDateString() === today.toDateString();
      const dayOfWeek = currentDate.toLocaleDateString('en-US', { weekday: 'long' });
      
      // Check for events on this day
      const dayEvents = this.getDayEvents(currentDate);
      const hasBirthday = dayEvents.some(event => event.type === 'birthday');
      const hasBloodmoon = dayEvents.some(event => event.type === 'bloodmoon');
      
      
      let dayClass = 'mobile-day-card';
      if (isToday) dayClass += ' today';
      if (hasBirthday) dayClass += ' has-birthday';
      if (hasBloodmoon) dayClass += ' has-bloodmoon';
      
      // Get Hyrulean date for this day
      const hyruleanDate = this.convertToHyruleanDate(currentDate);
      
      calendarHTML += `
        <div class="${dayClass}" data-date="${currentDate.toISOString().split('T')[0]}">
          <div class="mobile-day-header">
            <div class="mobile-day-number">${day}</div>
            <div class="mobile-day-of-week">${dayOfWeek}</div>
          </div>
          <div class="mobile-day-content">
            <div class="mobile-hyrulean-date">${hyruleanDate}</div>
            <div class="mobile-day-events">
              ${dayEvents.map(event => {
                return `
                <div class="mobile-day-event ${event.type}">
                  ${event.label}
                  ${event.tooltip ? `<div class="tooltip">${event.tooltip}</div>` : ''}
                </div>
              `;
              }).join('')}
            </div>
          </div>
        </div>
      `;
    }
    
    container.innerHTML = calendarHTML;
  }

  generateDesktopGrid(container, weekdaysContainer, year, month, today) {
    // Get first day of month and last day of month
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());
    
    let calendarHTML = '';
    
    // Generate weekday headers
    const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    let weekdaysHTML = '';
    weekdays.forEach(day => {
      weekdaysHTML += `<div class="weekday">${day}</div>`;
    });
    weekdaysContainer.innerHTML = weekdaysHTML;
    
    // Generate 6 weeks of calendar days
    for (let week = 0; week < 6; week++) {
      for (let day = 0; day < 7; day++) {
        const currentDate = new Date(startDate);
        currentDate.setDate(startDate.getDate() + (week * 7) + day);
        
        const isCurrentMonth = currentDate.getMonth() === month;
        const isToday = currentDate.toDateString() === today.toDateString();
        const dayNumber = currentDate.getDate();
        
        // Check for events on this day
        const dayEvents = this.getDayEvents(currentDate);
        const hasBirthday = dayEvents.some(event => event.type === 'birthday');
        const hasBloodmoon = dayEvents.some(event => event.type === 'bloodmoon');
        
        
        let dayClass = 'calendar-day';
        if (!isCurrentMonth) dayClass += ' other-month';
        if (isToday) dayClass += ' today';
        if (hasBirthday) dayClass += ' has-birthday';
        if (hasBloodmoon) dayClass += ' has-bloodmoon';
        
        // Get Hyrulean date for this day
        const hyruleanDate = this.convertToHyruleanDate(currentDate);
        
        calendarHTML += `
          <div class="${dayClass}" data-date="${currentDate.toISOString().split('T')[0]}">
            <div class="day-number">${dayNumber}</div>
            <div class="hyrulean-date">${hyruleanDate}</div>
            <div class="day-events">
              ${dayEvents.map(event => {
                return `
                <div class="day-event ${event.type}">
                  ${event.label}
                  ${event.tooltip ? `<div class="tooltip">${event.tooltip}</div>` : ''}
                </div>
              `;
              }).join('')}
            </div>
          </div>
        `;
      }
    }
    
    container.innerHTML = calendarHTML;
  }

  generateEventsList() {
    const container = document.getElementById('calendar-events');
    if (!container) return;
    
    const events = [];
    const year = this.currentDate.getFullYear();
    const month = this.currentDate.getMonth();
    
    // Add birthdays for current month
    this.birthdays.forEach(birthday => {
      const [birthdayMonth, day] = birthday.birthday.split('-');
      const eventDate = new Date(year, parseInt(birthdayMonth) - 1, parseInt(day));
      
      // Only include birthdays in the current month
      if (eventDate.getMonth() === month) {
        events.push({
          date: eventDate,
          type: 'birthday',
          name: birthday.name,
          icon: birthday.icon || '/api/images/default-avatar.png',
          day: parseInt(day)
        });
      }
    });
    
    // Add blood moons for current month
    this.bloodmoonDates.forEach(bloodmoon => {
      const [bloodmoonMonth, day] = bloodmoon.realDate.split('-');
      const eventDate = new Date(year, parseInt(bloodmoonMonth) - 1, parseInt(day));
      
      // Only include blood moons in the current month
      if (eventDate.getMonth() === month) {
        events.push({
          date: eventDate,
          type: 'bloodmoon',
          day: parseInt(day),
          hyruleanMonth: bloodmoon.month
        });
      }
    });
    
    // Sort events by day
    events.sort((a, b) => a.day - b.day);
    
    // Generate HTML
    if (events.length === 0) {
      container.innerHTML = `
        <h4>Events This Month</h4>
        <div class="events-list">
          <div class="no-events">No events scheduled for this month</div>
        </div>
      `;
      return;
    }
    
    const eventsHTML = events.map(event => {
      const dateStr = event.date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric' 
      });
      const hyruleanDate = this.convertToHyruleanDate(event.date);
      
      if (event.type === 'birthday') {
        return `
          <div class="event-item birthday-event">
            <div class="event-icon">🎂</div>
            <div class="event-details">
              <div class="event-title">${event.name}'s Birthday</div>
              <div class="event-date">${dateStr} • ${hyruleanDate}</div>
            </div>
          </div>
        `;
      } else if (event.type === 'bloodmoon') {
        return `
          <div class="event-item bloodmoon-event">
            <div class="event-icon">🌙</div>
            <div class="event-details">
              <div class="event-title">Blood Moon</div>
              <div class="event-date">${dateStr} • ${hyruleanDate}</div>
            </div>
          </div>
        `;
      }
    }).join('');
    
    container.innerHTML = `
      <h4>Events This Month</h4>
      <div class="events-list">
        ${eventsHTML}
      </div>
    `;
  }

  getDayEvents(date) {
    const events = [];
    const dateString = this.formatDateMMDD(date);
    
    // Check for birthdays
    const dayBirthdays = this.birthdays.filter(birthday => 
      birthday.birthday && birthday.birthday === dateString
    );
    
    if (dayBirthdays.length > 0) {

      
      if (dayBirthdays.length === 1) {
        // Single birthday - show name with cake
        events.push({
          type: 'birthday',
          label: `${dayBirthdays[0].name} 🎂`
        });
      } else {
        // Multiple birthdays - show count with cake and tooltip
        const names = dayBirthdays.map(b => b.name).join(', ');
        events.push({
          type: 'birthday',
          label: `${dayBirthdays.length} Birthdays 🎂`,
          tooltip: names
        });
      }
    }
    
    // Check for blood moon
    const bloodmoonDate = this.bloodmoonDates.find(
      entry => entry.realDate === dateString
    );
    if (bloodmoonDate) {
      events.push({
        type: 'bloodmoon',
        label: '🌙'
      });
    }
    
    return events;
  }

  convertToHyruleanDate(date) {
    const hyruleanMonth = this.getCurrentHyruleanMonth(date);
    if (hyruleanMonth) {
      // Use the same year as the input date to avoid year differences
      const year = date.getFullYear();
      const startDate = new Date(`${year}-${hyruleanMonth.start}T12:00:00`);
      const currentDate = new Date(year, date.getMonth(), date.getDate(), 12, 0, 0);
      
      const dayInMonth = Math.floor((currentDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      

      
      // Ensure the day is within valid range
      if (dayInMonth >= 1 && dayInMonth <= 26) {
        return `${hyruleanMonth.name} ${dayInMonth}`;
      }
    }
    return 'Unknown';
  }

  renderHyruleanCalendar() {
    const container = document.getElementById('hyrulean-calendar');
    if (!container) return;

    const today = new Date();
    const currentMonth = this.getCurrentHyruleanMonth(today);

    const calendarHTML = this.hyruleanCalendar.map(month => {
      const isCurrent = currentMonth && currentMonth.monthId === month.monthId;
      
      return `
        <div class="hyrulean-month-card ${isCurrent ? 'current' : ''}">
          <div class="hyrulean-month-header">
            <div class="hyrulean-month-name">${month.name}</div>
            <div class="hyrulean-month-id">${month.monthId}</div>
          </div>
          <div class="hyrulean-month-dates">
            ${month.start} - ${month.end}
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = calendarHTML;
  }

  renderBloodMoon() {
    const container = document.getElementById('bloodmoon-info');
    if (!container) return;

    const today = new Date();
    const todayMMDD = this.formatDateMMDD(today);
    const currentCycleDay = this.getCurrentBloodMoonCycleDay(today);
    const isBloodMoonToday = this.bloodmoonDates.some(
      entry => entry.realDate === todayMMDD
    );

    const cycleInfoHTML = `
      <div class="bloodmoon-cycle-info ${isBloodMoonToday ? 'current' : ''}">
        <div class="bloodmoon-cycle-day">${currentCycleDay || '?'}</div>
        <div class="bloodmoon-cycle-label">Current Cycle Day</div>
        <div class="bloodmoon-cycle-description">
          ${isBloodMoonToday 
            ? 'The Blood Moon rises tonight! Channel renaming and Blood Moon announcements are active.' 
            : `Day ${currentCycleDay} of 26. The Blood Moon follows a 26-day cycle. When it rises, special events occur throughout Hyrule.`
          }
        </div>
      </div>
    `;

    const datesListHTML = `
      <div class="bloodmoon-dates-list">
        <div class="bloodmoon-dates-header">Blood Moon Dates (All are Day 1 of their cycle)</div>
        ${this.bloodmoonDates.map((date, index) => {
          const isToday = date.realDate === todayMMDD;
          
          return `
            <div class="bloodmoon-date-item ${isToday ? 'today' : ''}">
              <div class="bloodmoon-date-icon">
                <i class="fas fa-moon"></i>
              </div>
              <div class="bloodmoon-date-info">
                <div class="bloodmoon-date-real">${date.realDate}</div>
                <div class="bloodmoon-date-hyrulean">${date.month} ${date.day}</div>
              </div>
              <div class="bloodmoon-date-cycle">Blood Moon (Day 1)</div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    container.innerHTML = cycleInfoHTML + datesListHTML;
  }

  showError(message) {
    const containers = [
      document.getElementById('birthdays-list'),
      document.getElementById('hyrulean-calendar'),
      document.getElementById('bloodmoon-info')
    ];

    containers.forEach(container => {
      if (container) {
        container.innerHTML = `
          <div class="calendar-error">
            <i class="fas fa-exclamation-triangle"></i>
            <p>${message}</p>
            <button class="calendar-retry-btn">Retry</button>
          </div>
        `;
      }
    });
  }

  showLoading() {
    const containers = [
      document.getElementById('birthdays-list'),
      document.getElementById('hyrulean-calendar'),
      document.getElementById('bloodmoon-info')
    ];

    containers.forEach(container => {
      if (container) {
        container.innerHTML = `
          <div class="calendar-loading">
            <div class="loading-spinner"></div>
            <p>Loading calendar data...</p>
          </div>
        `;
      }
    });
  }
}

// Initialize calendar module when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  window.calendarModule = new CalendarModule();
});

// Export for module usage
export default CalendarModule; 