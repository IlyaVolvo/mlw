import React from 'react';

export type GameStatus = 'won' | 'lost' | 'incomplete' | 'not-played';

// Helper function to format date as YYYY-MM-DD in local timezone
const formatLocalDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

interface CalendarDay {
  date: Date;
  day: number;
  status: GameStatus;
  isCurrentMonth: boolean;
  isToday: boolean;
  isFuture?: boolean;
}

interface CalendarProps {
  games: Array<{
    game_date?: string | null;
    gameDate?: string;
    gameEnded: string | null;
    gameStarted: string;
    isComplete: boolean;
    isWon: boolean;
    guesses: Array<{ word: string }>;
  }>;
  currentMonth: Date;
  onMonthChange: (date: Date) => void;
  onDateClick?: (date: string) => void;
}

export const Calendar: React.FC<CalendarProps> = ({
  games,
  currentMonth,
  onMonthChange,
  onDateClick,
}) => {
  // Create a map of date strings to game status
  const gameStatusMap = new Map<string, GameStatus>();
  
  // Create a set of all dates that have games in the database
  const datesWithGames = new Set<string>();
  
  games.forEach((game) => {
    // Use game_date (the date the game was generated for), not the date it was played
    let gameDate: string | null = null;
    
    if (game.game_date) {
      // game_date is already in YYYY-MM-DD format from the database
      gameDate = game.game_date;
    } else if (game.gameDate) {
      gameDate = game.gameDate;
    }
    
    // Only process games that have a game_date (daily games)
    // Skip random/training mode games that don't have game_date
    if (gameDate) {
      datesWithGames.add(gameDate);
      
      // Determine game status based on completion and win state
      if (game.isComplete && game.isWon) {
        gameStatusMap.set(gameDate, 'won');
      } else if (game.isComplete && !game.isWon) {
        gameStatusMap.set(gameDate, 'lost');
      } else if (!game.isComplete && game.guesses && game.guesses.length > 0) {
        gameStatusMap.set(gameDate, 'incomplete');
      }
    }
  });

  // Get first day of month and number of days
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startingDayOfWeek = firstDay.getDay();

  // Get previous and next month
  const prevMonth = () => {
    const newDate = new Date(year, month - 1, 1);
    onMonthChange(newDate);
  };

  const nextMonth = () => {
    const newDate = new Date(year, month + 1, 1);
    onMonthChange(newDate);
  };

  // Check if current month is the current month or later
  const currentMonthDate = new Date();
  const currentMonthYear = currentMonthDate.getFullYear();
  const currentMonthMonth = currentMonthDate.getMonth();
  const isCurrentMonthOrFuture = year > currentMonthYear || (year === currentMonthYear && month >= currentMonthMonth);
  const canGoToNextMonth = !isCurrentMonthOrFuture;

  // Generate calendar days
  const calendarDays: CalendarDay[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = formatLocalDate(today);

  // Add empty cells for days before the first day of the month
  for (let i = 0; i < startingDayOfWeek; i++) {
    const date = new Date(year, month, -i);
    calendarDays.push({
      date,
      day: date.getDate(),
      status: 'not-played',
      isCurrentMonth: false,
      isToday: false,
      isFuture: false,
    });
  }

  // Add days of the current month
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    date.setHours(0, 0, 0, 0);
    const dateString = formatLocalDate(date);
    const isToday = dateString === todayStr;
    const isFuture = dateString > todayStr;
    
    // Check if this date has a game in the database
    const hasGame = datesWithGames.has(dateString);
    
    // Determine status: if no game exists in DB and it's not future, it's grayed out
    // If it's future, it's already handled by isFuture
    let status: GameStatus;
    if (isFuture) {
      status = 'not-played'; // Future dates are not-played
    } else if (!hasGame) {
      status = 'not-played'; // Date has no game in DB - should be grayed out
    } else {
      status = gameStatusMap.get(dateString) || 'not-played';
    }

    calendarDays.push({
      date,
      day,
      status,
      isCurrentMonth: true,
      isToday,
      isFuture,
    });
  }

  // Add empty cells for days after the last day of the month to complete the grid
  const remainingCells = 42 - calendarDays.length; // 6 weeks * 7 days
  for (let day = 1; day <= remainingCells; day++) {
    const date = new Date(year, month + 1, day);
    const dateString = formatLocalDate(date);
    calendarDays.push({
      date,
      day: date.getDate(),
      status: 'not-played',
      isCurrentMonth: false,
      isToday: false,
      isFuture: dateString > todayStr,
    });
  }

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const handleDateClick = (day: CalendarDay) => {
    if (day.isCurrentMonth && !day.isFuture && onDateClick) {
      const dateString = formatLocalDate(day.date);
      onDateClick(dateString);
    }
  };

  const getDayClassName = (day: CalendarDay): string => {
    const classes = ['calendar-day'];
    
    if (!day.isCurrentMonth) {
      classes.push('calendar-day-other-month');
    }
    
    if (day.isToday) {
      classes.push('calendar-day-today');
    }
    
    if (day.isFuture) {
      classes.push('calendar-day-future');
    }
    
    classes.push(`calendar-day-${day.status}`);
    
    if (day.isCurrentMonth && !day.isFuture && day.status !== 'not-played') {
      classes.push('calendar-day-clickable');
    } else if (day.isCurrentMonth && !day.isFuture) {
      classes.push('calendar-day-clickable');
    }
    
    return classes.join(' ');
  };

  return (
    <div className="calendar-container">
      <div className="calendar-header">
        <button onClick={prevMonth} className="calendar-nav-button" aria-label="Previous month">
          ‹
        </button>
        <h3 className="calendar-month-year">
          {monthNames[month]} {year}
        </h3>
        <button 
          onClick={nextMonth} 
          className={`calendar-nav-button ${!canGoToNextMonth ? 'calendar-nav-button-disabled' : ''}`}
          aria-label="Next month"
          disabled={!canGoToNextMonth}
        >
          ›
        </button>
      </div>
      
      <div className="calendar-weekdays">
        {weekDays.map((day) => (
          <div key={day} className="calendar-weekday">
            {day}
          </div>
        ))}
      </div>
      
      <div className="calendar-grid">
        {calendarDays.map((day, index) => (
          <div
            key={index}
            className={getDayClassName(day)}
            onClick={() => handleDateClick(day)}
            title={
              day.isCurrentMonth
                ? `${day.date.toLocaleDateString()} - ${day.status === 'won' ? 'Won' : day.status === 'lost' ? 'Lost' : day.status === 'incomplete' ? 'Incomplete' : 'Not played'}`
                : undefined
            }
          >
            {day.isCurrentMonth ? day.day : ''}
          </div>
        ))}
      </div>
      
      <div className="calendar-legend">
        <div className="legend-item">
          <div className="legend-color legend-won"></div>
          <span>Won</span>
        </div>
        <div className="legend-item">
          <div className="legend-color legend-lost"></div>
          <span>Lost</span>
        </div>
        <div className="legend-item">
          <div className="legend-color legend-incomplete"></div>
          <span>Incomplete</span>
        </div>
        <div className="legend-item">
          <div className="legend-color legend-not-played"></div>
          <span>Not Played</span>
        </div>
      </div>
    </div>
  );
};
