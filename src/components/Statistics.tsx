import React, { useState, useEffect, useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  ChartOptions,
} from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';
import { apiClient } from '../api/client';
import { LanguageSelector } from './LanguageSelector';
import type { LanguageConfig } from '../types';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend
);

interface GameData {
  id: number;
  userId: number;
  isRandomMode: boolean;
  gameStarted: string;
  gameEnded: string | null;
  language: string;
  wordLength: number;
  targetWord: string;
  guesses: Array<{ word: string; evaluations: any[] }>;
  isComplete: boolean;
  isWon: boolean;
  guessesCount: number;
}

interface StatisticsProps {
  userId: number;
  availableLanguages: LanguageConfig[];
  allAvailableLanguages: LanguageConfig[];
  view?: 'game' | 'statistics';
  onViewChange?: (view: 'game' | 'statistics') => void;
  onViewHistoricalGame?: (date: string) => void;
  onLanguageSelectionChange: (selectedCodes: string[]) => void;
  language: string;
  wordLength: number;
  onLanguageChange: (language: string) => void;
  onWordLengthChange: (wordLength: number) => void;
}

type StatisticType = 
  | 'attempts-distribution'
  | 'running-daily'
  | 'calendar-weekly'
  | 'calendar-monthly'
  | 'calendar-yearly'
  | 'two-week-running'
  | 'four-week-running';

export const Statistics: React.FC<StatisticsProps> = ({ 
  userId, 
  availableLanguages,
  allAvailableLanguages,
  view, 
  onViewChange, 
  onViewHistoricalGame: _onViewHistoricalGame,
  onLanguageSelectionChange,
  language,
  wordLength,
  onLanguageChange,
  onWordLengthChange
}) => {
  const [modeFilter, setModeFilter] = useState<'daily' | 'all'>('all');
  const [statisticType, setStatisticType] = useState<StatisticType>('attempts-distribution');
  const [games, setGames] = useState<GameData[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [showOptions, setShowOptions] = useState(false);

  useEffect(() => {
    const loadStatistics = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await apiClient.getHistory(
          language,
          wordLength,
          10000 // Get a large number to calculate all stats
        );
        let filteredGames: GameData[] = response.games as GameData[];
        if (modeFilter === 'daily') {
          filteredGames = filteredGames.filter(game => !game.isRandomMode);
        }
        const completedGames = filteredGames.filter(game => game.isComplete);
        setGames(completedGames);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load statistics');
      } finally {
        setLoading(false);
      }
    };

    loadStatistics();
  }, [userId, language, wordLength, modeFilter]);

  // Calculate attempts distribution (1-6 for wins, 7 for losses)
  const attemptsDistribution = useMemo(() => {
    const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 };
    games.forEach(game => {
      const attempts = game.isWon ? game.guessesCount : 7;
      distribution[attempts] = (distribution[attempts] || 0) + 1;
    });
    return distribution;
  }, [games]);

  // Helper function to get attempts count (1-6 for wins, 7 for losses)
  const getAttempts = (game: GameData): number => {
    return game.isWon ? game.guessesCount : 7;
  };

  // Running daily average (average attempts for each day)
  const runningDailyAverage = useMemo(() => {
    const dailyData: Map<string, { total: number; count: number }> = new Map();
    games.forEach(game => {
      const date = new Date(game.gameEnded || game.gameStarted).toISOString().split('T')[0];
      const attempts = getAttempts(game);
      const existing = dailyData.get(date) || { total: 0, count: 0 };
      dailyData.set(date, {
        total: existing.total + attempts,
        count: existing.count + 1,
      });
    });
    
    const sortedDates = Array.from(dailyData.keys()).sort();
    const averages: { date: string; average: number }[] = [];
    let runningTotal = 0;
    let runningCount = 0;
    
    sortedDates.forEach(date => {
      const dayData = dailyData.get(date)!;
      runningTotal += dayData.total;
      runningCount += dayData.count;
      averages.push({
        date,
        average: runningCount > 0 ? runningTotal / runningCount : 0,
      });
    });
    
    return averages;
  }, [games]);

  // Calendar weekly average
  const calendarWeeklyAverage = useMemo(() => {
    const weeklyData: Map<string, { total: number; count: number }> = new Map();
    games.forEach(game => {
      const date = new Date(game.gameEnded || game.gameStarted);
      const year = date.getFullYear();
      const weekNum = getWeekNumber(date);
      const key = `${year}-W${weekNum.toString().padStart(2, '0')}`;
      const attempts = getAttempts(game);
      const existing = weeklyData.get(key) || { total: 0, count: 0 };
      weeklyData.set(key, {
        total: existing.total + attempts,
        count: existing.count + 1,
      });
    });
    
    return Array.from(weeklyData.entries())
      .map(([week, data]) => ({
        week,
        average: data.count > 0 ? data.total / data.count : 0,
      }))
      .sort((a, b) => a.week.localeCompare(b.week));
  }, [games]);

  // Calendar monthly average
  const calendarMonthlyAverage = useMemo(() => {
    const monthlyData: Map<string, { total: number; count: number }> = new Map();
    games.forEach(game => {
      const date = new Date(game.gameEnded || game.gameStarted);
      const year = date.getFullYear();
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const key = `${year}-${month}`;
      const attempts = getAttempts(game);
      const existing = monthlyData.get(key) || { total: 0, count: 0 };
      monthlyData.set(key, {
        total: existing.total + attempts,
        count: existing.count + 1,
      });
    });
    
    return Array.from(monthlyData.entries())
      .map(([month, data]) => ({
        month,
        average: data.count > 0 ? data.total / data.count : 0,
      }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }, [games]);

  // Calendar yearly average
  const calendarYearlyAverage = useMemo(() => {
    const yearlyData: Map<string, { total: number; count: number }> = new Map();
    games.forEach(game => {
      const date = new Date(game.gameEnded || game.gameStarted);
      const year = date.getFullYear().toString();
      const attempts = getAttempts(game);
      const existing = yearlyData.get(year) || { total: 0, count: 0 };
      yearlyData.set(year, {
        total: existing.total + attempts,
        count: existing.count + 1,
      });
    });
    
    return Array.from(yearlyData.entries())
      .map(([year, data]) => ({
        year,
        average: data.count > 0 ? data.total / data.count : 0,
      }))
      .sort((a, b) => a.year.localeCompare(b.year));
  }, [games]);

  // 2-week running average
  const twoWeekRunningAverage = useMemo(() => {
    const sortedGames = [...games].sort((a, b) => 
      new Date(a.gameEnded || a.gameStarted).getTime() - 
      new Date(b.gameEnded || b.gameStarted).getTime()
    );
    
    const averages: { date: string; average: number }[] = [];
    const window: GameData[] = [];
    
    sortedGames.forEach(game => {
      const gameDate = new Date(game.gameEnded || game.gameStarted);
      const cutoffDate = new Date(gameDate);
      cutoffDate.setDate(cutoffDate.getDate() - 14);
      
      // Remove games older than 14 days
      while (window.length > 0) {
        const windowDate = new Date(window[0].gameEnded || window[0].gameStarted);
        if (windowDate >= cutoffDate) break;
        window.shift();
      }
      
      window.push(game);
      
      if (window.length > 0) {
        const total = window.reduce((sum, g) => sum + getAttempts(g), 0);
        averages.push({
          date: gameDate.toISOString().split('T')[0],
          average: total / window.length,
        });
      }
    });
    
    return averages;
  }, [games]);

  // 4-week running average
  const fourWeekRunningAverage = useMemo(() => {
    const sortedGames = [...games].sort((a, b) => 
      new Date(a.gameEnded || a.gameStarted).getTime() - 
      new Date(b.gameEnded || b.gameStarted).getTime()
    );
    
    const averages: { date: string; average: number }[] = [];
    const window: GameData[] = [];
    
    sortedGames.forEach(game => {
      const gameDate = new Date(game.gameEnded || game.gameStarted);
      const cutoffDate = new Date(gameDate);
      cutoffDate.setDate(cutoffDate.getDate() - 28);
      
      // Remove games older than 28 days
      while (window.length > 0) {
        const windowDate = new Date(window[0].gameEnded || window[0].gameStarted);
        if (windowDate >= cutoffDate) break;
        window.shift();
      }
      
      window.push(game);
      
      if (window.length > 0) {
        const total = window.reduce((sum, g) => sum + getAttempts(g), 0);
        averages.push({
          date: gameDate.toISOString().split('T')[0],
          average: total / window.length,
        });
      }
    });
    
    return averages;
  }, [games]);

  // Helper function to get ISO week number
  function getWeekNumber(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  }

  const handleLanguageChange = (newLanguage: string) => {
    const langConfig = availableLanguages.find(l => l.code === newLanguage);
    if (langConfig && !langConfig.supportedLengths.includes(wordLength)) {
      onWordLengthChange(langConfig.supportedLengths[0] || 5);
    }
    onLanguageChange(newLanguage);
  };

  if (loading) {
    return <div className="loading">Loading statistics...</div>;
  }

  if (error) {
    return <div className="error">Error: {error}</div>;
  }

  const currentLangConfig = availableLanguages.find(lang => lang.code === language);

  // Chart configurations
  const totalGames = Object.values(attemptsDistribution).reduce((sum, count) => sum + count, 0);
  const attemptsDistributionPercentages = [
    totalGames > 0 ? parseFloat(((attemptsDistribution[1] / totalGames) * 100).toFixed(1)) : 0,
    totalGames > 0 ? parseFloat(((attemptsDistribution[2] / totalGames) * 100).toFixed(1)) : 0,
    totalGames > 0 ? parseFloat(((attemptsDistribution[3] / totalGames) * 100).toFixed(1)) : 0,
    totalGames > 0 ? parseFloat(((attemptsDistribution[4] / totalGames) * 100).toFixed(1)) : 0,
    totalGames > 0 ? parseFloat(((attemptsDistribution[5] / totalGames) * 100).toFixed(1)) : 0,
    totalGames > 0 ? parseFloat(((attemptsDistribution[6] / totalGames) * 100).toFixed(1)) : 0,
    totalGames > 0 ? parseFloat(((attemptsDistribution[7] / totalGames) * 100).toFixed(1)) : 0,
  ];
  
  const attemptsDistributionChartData = {
    labels: ['1', '2', '3', '4', '5', '6', 'Loss'],
    datasets: [
      {
        label: 'Percentage (%)',
        data: attemptsDistributionPercentages,
        backgroundColor: 'rgba(102, 126, 234, 0.6)',
        borderColor: 'rgba(102, 126, 234, 1)',
        borderWidth: 1,
      },
    ],
  };

  // Helper function to create chart options with dynamic y-axis range
  const createChartOptions = <T extends 'line' | 'bar'>(dataValues: number[]): ChartOptions<T> => {
    const minValue = Math.min(...dataValues);
    const maxValue = Math.max(...dataValues);
    const padding = 0.5;
    
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top' as const,
          labels: {
            font: {
              size: 14,
            },
          },
        },
        title: {
          display: false,
        },
      },
      scales: {
        y: {
          min: Math.max(0, minValue - padding), // Don't go below 0
          max: maxValue + padding,
          ticks: {
            font: {
              size: 12,
            },
          },
        },
        x: {
          ticks: {
            font: {
              size: 12,
            },
          },
        },
      },
      elements: {
        point: {
          radius: 2,
        },
      },
    } as unknown as ChartOptions<T>;
  };

  return (
    <div className="statistics-container">
      <div className="header-section">
        <h1>
          <span>PolyWordlot</span>
        </h1>
        {onViewChange && (
          <div className="header-tabs-row">
            <div className="view-tabs">
              <button
                className={`view-tab ${view === 'game' ? 'active' : ''}`}
                onClick={() => onViewChange('game')}
              >
                Game
              </button>
              <button
                className={`view-tab ${view === 'statistics' ? 'active' : ''}`}
                onClick={() => onViewChange('statistics')}
              >
                Statistics
              </button>
            </div>
            <button
              className={`options-icon-button ${showOptions ? 'active' : ''}`}
              onClick={() => setShowOptions(!showOptions)}
              title="Options"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M12 1v6m0 6v6m9-9h-6m-6 0H3m15.364 6.364l-4.243-4.243m-4.242 0l-4.243 4.243m4.242-4.242l-4.243 4.243m4.242 0l4.243 4.243"></path>
              </svg>
            </button>
          </div>
        )}
      </div>
      
      <div className="stats-filters">
        <div className="stat-filter-group">
          <select
            value={language}
            onChange={(e) => handleLanguageChange(e.target.value)}
          >
            {availableLanguages.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.name}
              </option>
            ))}
          </select>
        </div>
        
        <div className="stat-filter-group">
          <select
            value={wordLength}
            onChange={(e) => onWordLengthChange(Number(e.target.value))}
          >
            {currentLangConfig?.supportedLengths.map((length) => (
              <option key={length} value={length}>
                {length}
              </option>
            ))}
          </select>
        </div>
        
        <div className="stat-filter-group">
          <select
            value={modeFilter}
            onChange={(e) => setModeFilter(e.target.value as 'daily' | 'all')}
          >
            <option value="daily">Daily Only</option>
            <option value="all">All Games</option>
          </select>
        </div>
      </div>


      <div className="stat-display">
        <div className="stat-card">
          <div>
            <h3>
              <select
                value={statisticType}
                onChange={(e) => setStatisticType(e.target.value as StatisticType)}
                className="stat-title-select"
              >
                <option value="attempts-distribution">Attempts Distribution</option>
                <option value="running-daily">Running Daily Average</option>
                <option value="calendar-weekly">Calendar Weekly Average</option>
                <option value="calendar-monthly">Calendar Monthly Average</option>
                <option value="calendar-yearly">Calendar Yearly Average</option>
                <option value="two-week-running">2-Week Running Average</option>
                <option value="four-week-running">4-Week Running Average</option>
              </select>
            </h3>
            {statisticType === 'attempts-distribution' && (() => {
              const total = Object.values(attemptsDistribution).reduce((sum, count) => sum + count, 0);
              const sumAttempts = Object.entries(attemptsDistribution).reduce((sum, [attempts, count]) => {
                return sum + (parseInt(attempts) * count);
              }, 0);
              const average = total > 0 ? (sumAttempts / total).toFixed(3) : '0.000';
              return (
                <div style={{ fontSize: '0.9rem', fontWeight: 'normal', marginTop: '2px', marginBottom: '0', color: '#666', textAlign: 'center' }}>
                  Total Games: {total} (avg: {average})
                </div>
              );
            })()}
          </div>
          
          {statisticType === 'attempts-distribution' && (() => {
            const distribution = attemptsDistribution; // Capture for plugin
            const labelPlugin = {
              id: 'barLabels',
              afterDatasetsDraw: (chart: any) => {
                const ctx = chart.ctx;
                ctx.save();
                ctx.font = 'bold 14px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'bottom';
                ctx.fillStyle = '#333';
                
                chart.data.datasets.forEach((_dataset: any, i: number) => {
                  const meta = chart.getDatasetMeta(i);
                  meta.data.forEach((bar: any, index: number) => {
                    const count = distribution[index + 1] || 0;
                    if (count > 0) {
                      ctx.fillText(count.toString(), bar.x, bar.y - 5);
                    }
                  });
                });
                ctx.restore();
              }
            };
            
            return (
              <div style={{ height: '600px', position: 'relative', marginTop: '24px' }}>
                <Bar 
                  data={attemptsDistributionChartData} 
                  plugins={[labelPlugin]}
                  options={(() => {
                    const baseOptions = createChartOptions<'bar'>(attemptsDistributionPercentages);
                    return {
                      ...baseOptions,
                      plugins: {
                        ...baseOptions.plugins,
                        legend: {
                          display: false,
                        },
                      },
                    };
                  })()}
                />
              </div>
            );
          })()}

          {statisticType === 'running-daily' && (
            runningDailyAverage.length > 0 ? (
              <div style={{ height: '600px', position: 'relative' }}>
                <Line
                  data={{
                    labels: runningDailyAverage.map(d => d.date),
                    datasets: [
                      {
                        label: 'Average Attempts',
                        data: runningDailyAverage.map(d => d.average),
                        borderColor: 'rgba(102, 126, 234, 1)',
                        backgroundColor: 'rgba(102, 126, 234, 0.1)',
                      },
                    ],
                  }}
                  options={createChartOptions<'line'>(runningDailyAverage.map(d => d.average))}
                />
              </div>
            ) : (
              <p>No data available</p>
            )
          )}

          {statisticType === 'calendar-weekly' && (
            calendarWeeklyAverage.length > 0 ? (
              <div style={{ height: '600px', position: 'relative' }}>
                <Bar
                  data={{
                    labels: calendarWeeklyAverage.map(d => d.week),
                    datasets: [
                      {
                        label: 'Average Attempts',
                        data: calendarWeeklyAverage.map(d => d.average),
                        backgroundColor: 'rgba(102, 126, 234, 0.6)',
                        borderColor: 'rgba(102, 126, 234, 1)',
                        borderWidth: 1,
                      },
                    ],
                  }}
                  options={createChartOptions<'bar'>(calendarWeeklyAverage.map(d => d.average))}
                />
              </div>
            ) : (
              <p>No data available</p>
            )
          )}

          {statisticType === 'calendar-monthly' && (
            calendarMonthlyAverage.length > 0 ? (
              <div style={{ height: '600px', position: 'relative' }}>
                <Bar
                  data={{
                    labels: calendarMonthlyAverage.map(d => d.month),
                    datasets: [
                      {
                        label: 'Average Attempts',
                        data: calendarMonthlyAverage.map(d => d.average),
                        backgroundColor: 'rgba(102, 126, 234, 0.6)',
                        borderColor: 'rgba(102, 126, 234, 1)',
                        borderWidth: 1,
                      },
                    ],
                  }}
                  options={createChartOptions<'bar'>(calendarMonthlyAverage.map(d => d.average))}
                />
              </div>
            ) : (
              <p>No data available</p>
            )
          )}

          {statisticType === 'calendar-yearly' && (
            calendarYearlyAverage.length > 0 ? (
              <div style={{ height: '600px', position: 'relative' }}>
                <Bar
                  data={{
                    labels: calendarYearlyAverage.map(d => d.year),
                    datasets: [
                      {
                        label: 'Average Attempts',
                        data: calendarYearlyAverage.map(d => d.average),
                        backgroundColor: 'rgba(102, 126, 234, 0.6)',
                        borderColor: 'rgba(102, 126, 234, 1)',
                        borderWidth: 1,
                      },
                    ],
                  }}
                  options={createChartOptions<'bar'>(calendarYearlyAverage.map(d => d.average))}
                />
              </div>
            ) : (
              <p>No data available</p>
            )
          )}

          {statisticType === 'two-week-running' && (
            twoWeekRunningAverage.length > 0 ? (
              <div style={{ height: '600px', position: 'relative' }}>
                <Line
                  data={{
                    labels: twoWeekRunningAverage.map(d => d.date),
                    datasets: [
                      {
                        label: 'Average Attempts',
                        data: twoWeekRunningAverage.map(d => d.average),
                        borderColor: 'rgba(102, 126, 234, 1)',
                        backgroundColor: 'rgba(102, 126, 234, 0.1)',
                      },
                    ],
                  }}
                  options={createChartOptions<'line'>(twoWeekRunningAverage.map(d => d.average))}
                />
              </div>
            ) : (
              <p>No data available</p>
            )
          )}

          {statisticType === 'four-week-running' && (
            fourWeekRunningAverage.length > 0 ? (
              <div style={{ height: '600px', position: 'relative' }}>
                <Line
                  data={{
                    labels: fourWeekRunningAverage.map(d => d.date),
                    datasets: [
                      {
                        label: 'Average Attempts',
                        data: fourWeekRunningAverage.map(d => d.average),
                        borderColor: 'rgba(102, 126, 234, 1)',
                        backgroundColor: 'rgba(102, 126, 234, 0.1)',
                      },
                    ],
                  }}
                  options={createChartOptions<'line'>(fourWeekRunningAverage.map(d => d.average))}
                />
              </div>
            ) : (
              <p>No data available</p>
            )
          )}
        </div>
      </div>
      <LanguageSelector
        allAvailableLanguages={allAvailableLanguages}
        isOpen={showOptions}
        onClose={() => setShowOptions(false)}
        onSelectionChange={onLanguageSelectionChange}
      />
    </div>
  );
};

