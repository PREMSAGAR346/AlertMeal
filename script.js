// AlertMeal - Smart Meal Reminder App
// Main JavaScript functionality

class AlertMeal {
    constructor() {
        this.mealData = this.loadMealData();
        this.userPreferences = this.loadUserPreferences();
        this.currentRisk = 'low';
        this.alerts = [];
        this.alertInterval = null;
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.updateUI();
        this.startAlertSystem();
        this.setSelectedDate(this.getTodayDate());
    }

    // Data Management
    loadMealData() {
        try {
            const data = localStorage.getItem('alertmeal_data');
            return data ? JSON.parse(data) : [];
        } catch (error) {
            console.error('Failed to load meal data:', error);
            return [];
        }
    }

    saveMealData() {
        try {
            localStorage.setItem('alertmeal_data', JSON.stringify(this.mealData));
        } catch (error) {
            console.error('Failed to save meal data:', error);
        }
    }

    loadUserPreferences() {
        try {
            const data = localStorage.getItem('alertmeal_preferences');
            return data ? JSON.parse(data) : {
                breakfastTime: '08:00',
                lunchTime: '12:00',
                dinnerTime: '18:00',
                alertEnabled: true,
                alertAdvance: 15,
                skipThreshold: 60
            };
        } catch (error) {
            console.error('Failed to load user preferences:', error);
            return {
                breakfastTime: '08:00',
                lunchTime: '12:00',
                dinnerTime: '18:00',
                alertEnabled: true,
                alertAdvance: 15,
                skipThreshold: 60
            };
        }
    }

    saveUserPreferences() {
        try {
            localStorage.setItem('alertmeal_preferences', JSON.stringify(this.userPreferences));
        } catch (error) {
            console.error('Failed to save user preferences:', error);
        }
    }

    // Date Utilities
    formatDate(date) {
        return date.toISOString().split('T')[0];
    }

    formatTime(date) {
        return date.toTimeString().split(' ')[0].slice(0, 5);
    }

    getCurrentTime() {
        return this.formatTime(new Date());
    }

    getTodayDate() {
        return this.formatDate(new Date());
    }

    isToday(dateString) {
        return dateString === this.getTodayDate();
    }

    parseTime(timeString) {
        const [hours, minutes] = timeString.split(':').map(Number);
        const date = new Date();
        date.setHours(hours, minutes, 0, 0);
        return date;
    }

    addMinutes(timeString, minutes) {
        const date = this.parseTime(timeString);
        date.setMinutes(date.getMinutes() + minutes);
        return this.formatTime(date);
    }

    subtractMinutes(timeString, minutes) {
        const date = this.parseTime(timeString);
        date.setMinutes(date.getMinutes() - minutes);
        return this.formatTime(date);
    }

    // Meal Utilities
    getMealTimeForType(mealType) {
        switch (mealType) {
            case 'breakfast':
                return this.userPreferences.breakfastTime;
            case 'lunch':
                return this.userPreferences.lunchTime;
            case 'dinner':
                return this.userPreferences.dinnerTime;
            default:
                return '12:00';
        }
    }

    getTodayMeals() {
        const today = this.getTodayDate();
        return this.mealData.filter(meal => meal.date === today);
    }

    getSelectedDateMeals(date) {
        return this.mealData.filter(meal => meal.date === date);
    }

    getRecentMeals(days = 7) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);
        const cutoffString = this.formatDate(cutoffDate);
        
        return this.mealData.filter(meal => meal.date >= cutoffString);
    }

    getMealPattern(mealType) {
        const meals = this.mealData.filter(meal => meal.mealType === mealType);
        
        if (meals.length === 0) {
            return {
                averageTime: this.getMealTimeForType(mealType),
                consistency: 0,
                skipFrequency: 0,
                recentTrend: 'stable'
            };
        }

        // Calculate average time
        const consumedMeals = meals.filter(meal => meal.consumed);
        if (consumedMeals.length === 0) {
            return {
                averageTime: this.getMealTimeForType(mealType),
                consistency: 0,
                skipFrequency: 100,
                recentTrend: 'declining'
            };
        }

        const totalMinutes = consumedMeals.reduce((sum, meal) => {
            const [hours, minutes] = meal.time.split(':').map(Number);
            return sum + hours * 60 + minutes;
        }, 0);
        
        const avgMinutes = totalMinutes / consumedMeals.length;
        const avgHours = Math.floor(avgMinutes / 60);
        const avgMins = Math.round(avgMinutes % 60);
        const averageTime = `${avgHours.toString().padStart(2, '0')}:${avgMins.toString().padStart(2, '0')}`;

        // Calculate consistency
        const variance = consumedMeals.reduce((sum, meal) => {
            const [hours, minutes] = meal.time.split(':').map(Number);
            const mealMinutes = hours * 60 + minutes;
            return sum + Math.pow(mealMinutes - avgMinutes, 2);
        }, 0);
        
        const consistency = consumedMeals.length > 1 ? Math.max(0, 100 - Math.sqrt(variance / consumedMeals.length) / 2) : 0;

        // Calculate skip frequency
        const skipFrequency = (meals.filter(meal => meal.skipped).length / meals.length) * 100;

        // Calculate recent trend
        const recentMeals = meals.slice(-7);
        const olderMeals = meals.slice(-14, -7);
        
        const recentSkipRate = recentMeals.length > 0 ? recentMeals.filter(meal => meal.skipped).length / recentMeals.length : 0;
        const olderSkipRate = olderMeals.length > 0 ? olderMeals.filter(meal => meal.skipped).length / olderMeals.length : 0;

        let recentTrend = 'stable';
        if (recentSkipRate < olderSkipRate - 0.1) {
            recentTrend = 'improving';
        } else if (recentSkipRate > olderSkipRate + 0.1) {
            recentTrend = 'declining';
        }

        return {
            averageTime,
            consistency,
            skipFrequency,
            recentTrend
        };
    }

    // Risk Prediction
    calculateSkipRisk() {
        const todayMeals = this.getTodayMeals();
        const currentTime = new Date();
        const risks = [];

        ['breakfast', 'lunch', 'dinner'].forEach((mealType) => {
            const todayMeal = todayMeals.find(meal => meal.mealType === mealType);
            
            // Skip if meal already consumed or skipped
            if (todayMeal && (todayMeal.consumed || todayMeal.skipped)) {
                return;
            }

            const expectedTime = this.getMealTimeForType(mealType);
            const expectedDate = this.parseTime(expectedTime);
            const minutesUntilMeal = Math.floor((expectedDate.getTime() - currentTime.getTime()) / (1000 * 60));
            
            // Get historical pattern
            const pattern = this.getMealPattern(mealType);
            
            // Calculate risk factors
            const factors = [];
            let riskScore = 0;

            // Time-based risk
            if (minutesUntilMeal < -this.userPreferences.skipThreshold) {
                riskScore += 40;
                factors.push('Significantly overdue');
            } else if (minutesUntilMeal < 0) {
                riskScore += 25;
                factors.push('Past expected time');
            } else if (minutesUntilMeal < 30) {
                riskScore += 10;
                factors.push('Approaching meal time');
            }

            // Historical skip pattern
            if (pattern.skipFrequency > 30) {
                riskScore += 20;
                factors.push('High skip frequency');
            } else if (pattern.skipFrequency > 15) {
                riskScore += 10;
                factors.push('Moderate skip frequency');
            }

            // Recent trend
            if (pattern.recentTrend === 'declining') {
                riskScore += 15;
                factors.push('Declining eating pattern');
            }

            // Consistency factor
            if (pattern.consistency < 50) {
                riskScore += 10;
                factors.push('Inconsistent meal timing');
            }

            // Weekend pattern
            const dayOfWeek = currentTime.getDay();
            if (dayOfWeek === 0 || dayOfWeek === 6) {
                riskScore += 5;
                factors.push('Weekend pattern');
            }

            // Determine risk level
            let risk = 'low';
            if (riskScore >= 60) {
                risk = 'high';
            } else if (riskScore >= 30) {
                risk = 'medium';
            }

            risks.push({
                mealType,
                risk,
                probability: Math.min(riskScore, 100),
                factors: factors.length > 0 ? factors : ['No risk factors detected']
            });
        });

        return risks;
    }

    updateRiskIndicator() {
        const risks = this.calculateSkipRisk();
        const riskIndicator = document.getElementById('risk-indicator');
        const riskTitle = document.getElementById('risk-title');
        const riskDescription = document.getElementById('risk-description');
        const riskPercent = document.getElementById('risk-percent');

        if (risks.length === 0) {
            riskIndicator.className = 'risk-indicator low';
            riskTitle.textContent = 'Skip Risk: Low';
            riskDescription.textContent = 'All meals completed for today!';
            riskPercent.textContent = '0%';
            this.currentRisk = 'low';
            
            // Update emoji
            const riskEmoji = riskIndicator.querySelector('.risk-emoji');
            if (riskEmoji) riskEmoji.textContent = '🟢';
            return;
        }

        // Calculate overall risk
        const highRiskCount = risks.filter(r => r.risk === 'high').length;
        const mediumRiskCount = risks.filter(r => r.risk === 'medium').length;
        
        let overall = 'low';
        if (highRiskCount > 0) {
            overall = 'high';
        } else if (mediumRiskCount > 0) {
            overall = 'medium';
        }

        const maxRisk = Math.max(...risks.map(r => r.probability));
        
        riskIndicator.className = `risk-indicator ${overall}`;
        riskTitle.textContent = `Skip Risk: ${overall.charAt(0).toUpperCase() + overall.slice(1)}`;
        riskDescription.textContent = `${risks.length} upcoming meal${risks.length !== 1 ? 's' : ''} to track`;
        riskPercent.textContent = `${maxRisk}%`;
        
        // Update emoji
        const riskEmoji = riskIndicator.querySelector('.risk-emoji');
        if (riskEmoji) {
            switch (overall) {
                case 'high':
                    riskEmoji.textContent = '🔴';
                    break;
                case 'medium':
                    riskEmoji.textContent = '🟡';
                    break;
                default:
                    riskEmoji.textContent = '🟢';
            }
        }
        
        this.currentRisk = overall;
    }

    // Alert System
    startAlertSystem() {
        if (this.alertInterval) {
            clearInterval(this.alertInterval);
        }
        
        this.checkAlerts();
        this.alertInterval = setInterval(() => {
            this.checkAlerts();
        }, 60000); // Check every minute
    }

    checkAlerts() {
        if (!this.userPreferences.alertEnabled) {
            this.hideAlerts();
            return;
        }

        const newAlerts = [];
        const todayMeals = this.getTodayMeals();
        const currentTime = new Date();
        
        ['breakfast', 'lunch', 'dinner'].forEach((mealType) => {
            const existingMeal = todayMeals.find(meal => meal.mealType === mealType);
            
            if (existingMeal && (existingMeal.consumed || existingMeal.skipped)) {
                return;
            }

            const expectedTime = this.getMealTimeForType(mealType);
            const expectedDate = this.parseTime(expectedTime);
            const alertTime = new Date(expectedDate);
            alertTime.setMinutes(alertTime.getMinutes() - this.userPreferences.alertAdvance);
            
            const overdue = currentTime > expectedDate;
            const alertDue = currentTime >= alertTime;
            
            if (overdue) {
                const minutesLate = Math.floor((currentTime.getTime() - expectedDate.getTime()) / (1000 * 60));
                newAlerts.push({
                    id: `overdue-${mealType}`,
                    mealType,
                    message: `${mealType.charAt(0).toUpperCase() + mealType.slice(1)} is ${minutesLate} minutes overdue`,
                    priority: minutesLate > this.userPreferences.skipThreshold ? 'high' : 'medium',
                    timestamp: new Date()
                });
            } else if (alertDue) {
                const minutesUntil = Math.floor((expectedDate.getTime() - currentTime.getTime()) / (1000 * 60));
                newAlerts.push({
                    id: `reminder-${mealType}`,
                    mealType,
                    message: `${mealType.charAt(0).toUpperCase() + mealType.slice(1)} time in ${minutesUntil} minutes`,
                    priority: 'low',
                    timestamp: new Date()
                });
            }
        });

        this.alerts = newAlerts;
        this.updateAlertDisplay();
    }

    updateAlertDisplay() {
        const alertContainer = document.getElementById('alert-container');
        const alertsList = document.getElementById('alerts-list');

        if (this.alerts.length === 0) {
            alertContainer.classList.add('hidden');
            return;
        }

        alertContainer.classList.remove('hidden');
        alertsList.innerHTML = '';

        this.alerts.forEach(alert => {
            const alertElement = document.createElement('div');
            alertElement.className = `alert-item ${alert.priority}`;
            alertElement.innerHTML = `
                <div class="alert-content">
                    <div class="alert-priority-icon">
                        ${this.getAlertIcon(alert.priority)}
                    </div>
                    <div class="alert-message">
                        <p>${alert.message}</p>
                        <div class="alert-time">${alert.timestamp.toLocaleTimeString()}</div>
                    </div>
                </div>
                <button class="alert-dismiss" onclick="alertMeal.dismissAlert('${alert.id}')">×</button>
            `;
            alertsList.appendChild(alertElement);
        });
    }

    getAlertIcon(priority) {
        switch (priority) {
            case 'high':
                return '⚠️';
            case 'medium':
                return '🕐';
            default:
                return '🔔';
        }
    }

    dismissAlert(alertId) {
        this.alerts = this.alerts.filter(alert => alert.id !== alertId);
        this.updateAlertDisplay();
    }

    hideAlerts() {
        document.getElementById('alert-container').classList.add('hidden');
        this.alerts = [];
    }

    // Meal Management
    addMeal(mealData) {
        const newMeal = {
            id: Date.now().toString(),
            ...mealData
        };
        this.mealData.push(newMeal);
        this.saveMealData();
        this.updateUI();
    }

    updateMeal(id, updates) {
        const mealIndex = this.mealData.findIndex(meal => meal.id === id);
        if (mealIndex !== -1) {
            this.mealData[mealIndex] = { ...this.mealData[mealIndex], ...updates };
            this.saveMealData();
            this.updateUI();
        }
    }

    deleteMeal(id) {
        this.mealData = this.mealData.filter(meal => meal.id !== id);
        this.saveMealData();
        this.updateUI();
    }

    quickLogMeal(mealType, consumed, selectedDate) {
        const existingMeal = this.getSelectedDateMeals(selectedDate).find(meal => meal.mealType === mealType);
        
        if (existingMeal) {
            this.updateMeal(existingMeal.id, { 
                consumed, 
                skipped: !consumed, 
                time: this.getCurrentTime() 
            });
        } else {
            this.addMeal({
                date: selectedDate,
                mealType,
                time: this.getCurrentTime(),
                consumed,
                skipped: !consumed
            });
        }
    }

    // UI Updates
    updateUI() {
        this.updateRiskIndicator();
        this.updateMealCards();
        this.updateMealHistory();
        this.updateTrendsTab();
        this.updateSettingsTab();
    }

    updateMealCards() {
        const selectedDate = document.getElementById('selected-date').value;
        const selectedDateMeals = this.getSelectedDateMeals(selectedDate);
        
        ['breakfast', 'lunch', 'dinner'].forEach(mealType => {
            const card = document.querySelector(`[data-meal="${mealType}"]`);
            const meal = selectedDateMeals.find(m => m.mealType === mealType);
            const statusElement = card.querySelector('.meal-status');
            const timeElement = card.querySelector('.time-text');
            const notesElement = card.querySelector('.meal-notes');
            
            if (meal) {
                const status = meal.consumed ? 'consumed' : 'skipped';
                statusElement.textContent = status;
                statusElement.setAttribute('data-status', status);
                timeElement.textContent = meal.time;
                notesElement.textContent = meal.notes || '';
            } else {
                statusElement.textContent = 'pending';
                statusElement.setAttribute('data-status', 'pending');
                const expectedTime = this.getMealTimeForType(mealType);
                timeElement.textContent = `${expectedTime} (expected)`;
                notesElement.textContent = '';
            }
        });
    }

    updateMealHistory() {
        const selectedDate = document.getElementById('selected-date').value;
        const selectedDateMeals = this.getSelectedDateMeals(selectedDate);
        const historyContainer = document.getElementById('meal-history');
        const historyList = document.getElementById('history-list');
        
        if (selectedDateMeals.length === 0) {
            historyContainer.classList.add('hidden');
            return;
        }
        
        historyContainer.classList.remove('hidden');
        historyList.innerHTML = '';
        
        selectedDateMeals.forEach(meal => {
            const historyItem = document.createElement('div');
            historyItem.className = 'history-item';
            
            const mealIcon = this.getMealIcon(meal.mealType);
            const statusText = meal.consumed ? 'Consumed' : 'Skipped';
            const statusClass = meal.consumed ? 'consumed' : 'skipped';
            
            historyItem.innerHTML = `
                <div class="history-info">
                    <div class="history-icon">${mealIcon}</div>
                    <div class="history-details">
                        <h4>${meal.mealType.charAt(0).toUpperCase() + meal.mealType.slice(1)} - ${meal.time}</h4>
                        ${meal.notes ? `<p>${meal.notes}</p>` : ''}
                    </div>
                </div>
                <div class="history-actions">
                    <span class="meal-status" data-status="${statusClass}">${statusText}</span>
                    <button class="delete-btn" onclick="alertMeal.deleteMeal('${meal.id}')">🗑️</button>
                </div>
            `;
            
            historyList.appendChild(historyItem);
        });
    }

    getMealIcon(mealType) {
        switch (mealType) {
            case 'breakfast':
                return '☕';
            case 'lunch':
                return '🍽️';
            case 'dinner':
                return '🍳';
            default:
                return '🍽️';
        }
    }

    updateTrendsTab() {
        this.updateWeeklyCalendar();
        this.updateMealPatterns();
        this.updateSummaryStats();
    }

    updateWeeklyCalendar() {
        const calendarGrid = document.getElementById('calendar-grid');
        calendarGrid.innerHTML = '';
        
        const today = new Date();
        
        for (let i = 6; i >= 0; i--) {
            const date = new Date(today);
            date.setDate(date.getDate() - i);
            const dateString = this.formatDate(date);
            const dayMeals = this.mealData.filter(meal => meal.date === dateString);
            
            const dayElement = document.createElement('div');
            dayElement.className = 'calendar-day';
            
            const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
            
            dayElement.innerHTML = `
                <div class="day-name">${dayName}</div>
                <div class="day-meals">
                    ${['breakfast', 'lunch', 'dinner'].map(mealType => {
                        const meal = dayMeals.find(m => m.mealType === mealType);
                        let className = 'meal-dot not-logged';
                        
                        if (meal) {
                            className = meal.consumed ? 'meal-dot consumed' : 'meal-dot skipped';
                        }
                        
                        const title = `${mealType} - ${meal ? (meal.consumed ? 'Consumed' : 'Skipped') : 'Not logged'}`;
                        
                        return `<div class="${className}" title="${title}"></div>`;
                    }).join('')}
                </div>
            `;
            
            calendarGrid.appendChild(dayElement);
        }
    }

    updateMealPatterns() {
        ['breakfast', 'lunch', 'dinner'].forEach(mealType => {
            const pattern = this.getMealPattern(mealType);
            const patternCard = document.getElementById(`${mealType}-pattern`);
            
            // Update trend indicator
            const trendIndicator = patternCard.querySelector('.trend-indicator');
            const trendIcon = patternCard.querySelector('.trend-icon');
            const trendText = patternCard.querySelector('.trend-text');
            
            trendIndicator.className = `trend-indicator ${pattern.recentTrend}`;
            trendText.textContent = pattern.recentTrend;
            
            switch (pattern.recentTrend) {
                case 'improving':
                    trendIcon.textContent = '📈';
                    break;
                case 'declining':
                    trendIcon.textContent = '📉';
                    break;
                default:
                    trendIcon.textContent = '📊';
            }
            
            // Update stats
            const stats = patternCard.querySelectorAll('.stat');
            
            // Average time
            stats[0].querySelector('.stat-value').textContent = pattern.averageTime;
            
            // Consistency
            stats[1].querySelector('.stat-value').textContent = `${pattern.consistency.toFixed(0)}%`;
            stats[1].querySelector('.progress-fill').style.width = `${pattern.consistency}%`;
            
            // Skip rate
            stats[2].querySelector('.stat-value').textContent = `${pattern.skipFrequency.toFixed(0)}%`;
            stats[2].querySelector('.progress-fill').style.width = `${pattern.skipFrequency}%`;
        });
    }

    updateSummaryStats() {
        const weeklyData = [];
        const today = new Date();
        
        for (let i = 6; i >= 0; i--) {
            const date = new Date(today);
            date.setDate(date.getDate() - i);
            const dateString = this.formatDate(date);
            const dayMeals = this.mealData.filter(meal => meal.date === dateString);
            
            weeklyData.push({
                date: dateString,
                meals: {
                    breakfast: dayMeals.find(m => m.mealType === 'breakfast'),
                    lunch: dayMeals.find(m => m.mealType === 'lunch'),
                    dinner: dayMeals.find(m => m.mealType === 'dinner')
                }
            });
        }
        
        const totalMeals = weeklyData.length * 3;
        const consumedMeals = weeklyData.reduce((sum, day) => {
            return sum + Object.values(day.meals).filter(meal => meal?.consumed).length;
        }, 0);
        const skippedMeals = weeklyData.reduce((sum, day) => {
            return sum + Object.values(day.meals).filter(meal => meal?.skipped).length;
        }, 0);
        
        document.getElementById('consumed-count').textContent = `${consumedMeals}/${totalMeals}`;
        document.getElementById('skipped-count').textContent = skippedMeals.toString();
        document.getElementById('success-rate').textContent = `${((consumedMeals / totalMeals) * 100).toFixed(0)}%`;
    }

    updateSettingsTab() {
        document.getElementById('breakfast-time').value = this.userPreferences.breakfastTime;
        document.getElementById('lunch-time').value = this.userPreferences.lunchTime;
        document.getElementById('dinner-time').value = this.userPreferences.dinnerTime;
        document.getElementById('alerts-enabled').checked = this.userPreferences.alertEnabled;
        document.getElementById('alert-advance').value = this.userPreferences.alertAdvance;
        document.getElementById('skip-threshold').value = this.userPreferences.skipThreshold;
    }

    // Event Handlers
    setupEventListeners() {
        // Tab navigation
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tabId = e.currentTarget.getAttribute('data-tab');
                this.switchTab(tabId);
            });
        });

        // Date selector
        document.getElementById('selected-date').addEventListener('change', (e) => {
            this.setSelectedDate(e.target.value);
        });

        // Meal actions
        document.querySelectorAll('.meal-card').forEach(card => {
            const mealType = card.getAttribute('data-meal');
            
            card.querySelector('.action-btn.consumed').addEventListener('click', () => {
                const selectedDate = document.getElementById('selected-date').value;
                this.quickLogMeal(mealType, true, selectedDate);
            });
            
            card.querySelector('.action-btn.skipped').addEventListener('click', () => {
                const selectedDate = document.getElementById('selected-date').value;
                this.quickLogMeal(mealType, false, selectedDate);
            });
        });

        // Add meal form
        document.getElementById('add-meal-btn').addEventListener('click', () => {
            this.showAddMealForm();
        });

        document.getElementById('close-modal').addEventListener('click', () => {
            this.hideAddMealForm();
        });

        document.getElementById('cancel-add').addEventListener('click', () => {
            this.hideAddMealForm();
        });

        document.getElementById('save-meal').addEventListener('click', () => {
            this.saveNewMeal();
        });

        // Alert system
        document.getElementById('dismiss-alerts').addEventListener('click', () => {
            this.hideAlerts();
        });

        // Settings
        document.getElementById('save-settings').addEventListener('click', () => {
            this.saveSettings();
        });

        document.getElementById('reset-settings').addEventListener('click', () => {
            this.resetSettings();
        });

        document.getElementById('clear-data').addEventListener('click', () => {
            this.clearAllData();
        });

        // Modal close on background click
        document.getElementById('add-meal-form').addEventListener('click', (e) => {
            if (e.target.id === 'add-meal-form') {
                this.hideAddMealForm();
            }
        });
    }

    switchTab(tabId) {
        // Update tab buttons
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabId}"]`).classList.add('active');

        // Update tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(`${tabId}-tab`).classList.add('active');

        // Update UI for specific tabs
        if (tabId === 'trends') {
            this.updateTrendsTab();
        } else if (tabId === 'settings') {
            this.updateSettingsTab();
        }
    }

    setSelectedDate(date) {
        document.getElementById('selected-date').value = date;
        
        const todayIndicator = document.getElementById('today-indicator');
        if (this.isToday(date)) {
            todayIndicator.classList.remove('hidden');
        } else {
            todayIndicator.classList.add('hidden');
        }
        
        this.updateMealCards();
        this.updateMealHistory();
    }

    showAddMealForm() {
        const form = document.getElementById('add-meal-form');
        form.classList.remove('hidden');
        
        // Set default values
        document.getElementById('meal-time').value = this.getCurrentTime();
    }

    hideAddMealForm() {
        document.getElementById('add-meal-form').classList.add('hidden');
        
        // Reset form
        document.getElementById('meal-type').value = 'breakfast';
        document.getElementById('meal-time').value = this.getCurrentTime();
        document.getElementById('meal-status').value = 'consumed';
        document.getElementById('meal-notes').value = '';
    }

    saveNewMeal() {
        const selectedDate = document.getElementById('selected-date').value;
        const mealType = document.getElementById('meal-type').value;
        const time = document.getElementById('meal-time').value;
        const consumed = document.getElementById('meal-status').value === 'consumed';
        const notes = document.getElementById('meal-notes').value;

        this.addMeal({
            date: selectedDate,
            mealType,
            time,
            consumed,
            skipped: !consumed,
            notes
        });

        this.hideAddMealForm();
    }

    saveSettings() {
        this.userPreferences = {
            breakfastTime: document.getElementById('breakfast-time').value,
            lunchTime: document.getElementById('lunch-time').value,
            dinnerTime: document.getElementById('dinner-time').value,
            alertEnabled: document.getElementById('alerts-enabled').checked,
            alertAdvance: parseInt(document.getElementById('alert-advance').value) || 15,
            skipThreshold: parseInt(document.getElementById('skip-threshold').value) || 60
        };

        this.saveUserPreferences();
        this.updateUI();
        
        // Show saved message
        const saveBtn = document.getElementById('save-settings');
        const originalText = saveBtn.innerHTML;
        saveBtn.innerHTML = '<span>✓</span> Saved!';
        saveBtn.style.background = '#10b981';
        
        setTimeout(() => {
            saveBtn.innerHTML = originalText;
            saveBtn.style.background = '';
        }, 2000);
    }

    resetSettings() {
        this.userPreferences = {
            breakfastTime: '08:00',
            lunchTime: '12:00',
            dinnerTime: '18:00',
            alertEnabled: true,
            alertAdvance: 15,
            skipThreshold: 60
        };

        this.saveUserPreferences();
        this.updateSettingsTab();
        this.updateUI();
    }

    clearAllData() {
        if (confirm('Are you sure you want to clear all data? This cannot be undone.')) {
            localStorage.removeItem('alertmeal_data');
            localStorage.removeItem('alertmeal_preferences');
            location.reload();
        }
    }
}

// Initialize the app when the page loads
let alertMeal;

document.addEventListener('DOMContentLoaded', () => {
    alertMeal = new AlertMeal();
});

// Make functions available globally for onclick handlers
window.alertMeal = alertMeal;