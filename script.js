/**
 * Main Application Script
 */

/**
 * Main Application Script
 */

import { auth, provider, signInWithPopup, signOut, onAuthStateChanged, db, doc, setDoc, getDoc } from "./firebase-config.js";

const stopwatchGrid = document.getElementById('stopwatch-grid');
const addStopwatchBtn = document.getElementById('add-stopwatch-btn');
const addTimerBtn = document.getElementById('add-timer-btn');
const authBtn = document.getElementById('auth-btn');
const userInfo = document.getElementById('user-info');
const userNameDisplay = document.getElementById('user-name');
const userAvatar = document.getElementById('user-avatar');
const logoutBtn = document.getElementById('logout-btn');

let instances = []; // Store active stopwatch/timer objects
let currentUser = null;

/**
 * Persistence Manager
 */
const saveToLocal = () => {
    const data = instances.map(i => i.serialize());
    localStorage.setItem('chronos_data', JSON.stringify(data));
};

const loadFromLocal = () => {
    const data = localStorage.getItem('chronos_data');
    return data ? JSON.parse(data) : [];
};

const saveToCloud = async () => {
    if (!currentUser) return;
    const data = instances.map(i => i.serialize());
    try {
        await setDoc(doc(db, "users", currentUser.uid), {
            timers: data,
            lastUpdated: Date.now()
        });
    } catch (e) {
        console.error("Error saving to cloud:", e);
    }
};

// Unified Save Trigger
const triggerSave = () => {
    saveToLocal();
    if (currentUser) {
        // Debounce cloud save to avoid too many writes
        clearTimeout(window.cloudSaveTimeout);
        window.cloudSaveTimeout = setTimeout(saveToCloud, 2000);
    }
};

// Custom Modal Logic
const deleteModal = document.getElementById('delete-modal');
const cancelDeleteBtn = document.getElementById('cancel-delete');
const confirmDeleteBtn = document.getElementById('confirm-delete');

let deleteResolver = null;

const showDeleteModal = () => {
    return new Promise((resolve) => {
        deleteModal.classList.remove('hidden');
        deleteResolver = resolve;
    });
};

const hideDeleteModal = (result) => {
    deleteModal.classList.add('hidden');
    if (deleteResolver) {
        deleteResolver(result);
        deleteResolver = null;
    }
};

cancelDeleteBtn.addEventListener('click', () => hideDeleteModal(false));
confirmDeleteBtn.addEventListener('click', () => hideDeleteModal(true));

/**
 * Base class for a Time Keeper (Counter)
 */
class TimeKeeper {
    constructor(type, templateId, existingData = null) {
        this.id = existingData ? existingData.id : Date.now().toString(36) + Math.random().toString(36).substr(2);
        this.type = type;
        this.element = this.createUI(templateId);

        // State
        this.isRunning = existingData ? existingData.isRunning : false;
        this.startTime = existingData ? existingData.startTime : 0;
        this.elapsedTime = existingData ? existingData.elapsedTime : 0;
        this.title = existingData ? existingData.title : (type === 'stopwatch' ? 'Stopwatch' : 'Timer');

        this.interval = null;

        // UI Refs
        this.display = this.element.querySelector('.time-display');
        this.startBtn = this.element.querySelector('.start-btn');
        this.pauseBtn = this.element.querySelector('.pause-btn');
        this.resetBtn = this.element.querySelector('.reset-btn');
        this.deleteBtn = this.element.querySelector('.delete-btn');
        this.titleInput = this.element.querySelector('.card-title');

        // Initialize UI
        this.titleInput.value = this.title;
        this.attachEvents();

        // Initialize UI
        this.titleInput.value = this.title;
        this.attachEvents();

        // Auto-resume logic moved to subclasses to ensure 'this' is fully initialized
    }

    createUI(templateId) {
        const template = document.getElementById(templateId);
        const clone = template.content.cloneNode(true);
        const div = clone.querySelector('div');
        div.dataset.id = this.id;
        stopwatchGrid.appendChild(div);
        return div;
    }

    attachEvents() {
        this.startBtn.addEventListener('click', () => this.start());
        this.pauseBtn.addEventListener('click', () => this.stop());
        this.resetBtn.addEventListener('click', () => this.reset());
        this.deleteBtn.addEventListener('click', () => this.destroy());
        this.deleteBtn.addEventListener('click', () => this.destroy());

        const saveTitle = (e) => {
            this.title = e.target.value;
            triggerSave();
        };
        this.titleInput.addEventListener('change', saveTitle);
        this.titleInput.addEventListener('input', saveTitle);
    }

    async destroy() {
        // Use custom modal instead of native confirm
        const confirmed = await showDeleteModal();
        if (!confirmed) return;

        this.stop();
        this.element.remove();
        instances = instances.filter(i => i !== this);
        triggerSave();
    }

    serialize() {
        return {
            id: this.id,
            type: this.type,
            isRunning: this.isRunning,
            startTime: this.startTime,
            elapsedTime: this.elapsedTime,
            title: this.title,
            // For timers:
            targetTime: this.targetTime || 0,
            remainingTime: this.remainingTime || 0,
            originalDuration: this.originalDuration || 0
        };
    }

    // Abstract methods to be overridden
    start() { }
    stop() { }
    reset() { }
    updateDisplay() { }
}

/**
 * Stopwatch Implementation
 */
class Stopwatch extends TimeKeeper {
    constructor(existingData = null) {
        super('stopwatch', 'stopwatch-template', existingData);
        this.millisecondsEl = this.display.querySelector('.milliseconds');
        if (this.isRunning) {
            this.start(true);
        } else {
            this.updateDisplay(this.elapsedTime);
        }
    }

    start(isResume = false) {
        if (!isResume) {
            if (this.isRunning) return;
            this.isRunning = true;
            // Adjust start time so that (Now - Start) equals the previously accumulated elapsed time
            // New Start = Now - Already Elapsed
            this.startTime = Date.now() - this.elapsedTime;
            triggerSave();
        }

        this.toggleButtons();
        this.interval = requestAnimationFrame(this.tick.bind(this));
    }

    stop() {
        if (!this.isRunning) return;
        this.isRunning = false;
        // Elapsed is frozen at the moment of stop
        this.elapsedTime = Date.now() - this.startTime;
        cancelAnimationFrame(this.interval);
        this.toggleButtons();
        triggerSave();
    }

    reset() {
        this.stop();
        this.elapsedTime = 0;
        this.startTime = 0;
        this.updateDisplay(0);
        triggerSave();
    }

    tick() {
        if (!this.isRunning) return;
        // Always calculate from start time to prevent drift and allow execution while closed
        this.elapsedTime = Date.now() - this.startTime;
        this.updateDisplay(this.elapsedTime);
        this.interval = requestAnimationFrame(this.tick.bind(this));
    }

    updateDisplay(time) {
        const date = new Date(time);
        const d = Math.floor(time / (1000 * 60 * 60 * 24));
        const h = String(date.getUTCHours()).padStart(2, '0');
        const m = String(date.getUTCMinutes()).padStart(2, '0');
        const s = String(date.getUTCSeconds()).padStart(2, '0');
        const ms = String(Math.floor(date.getUTCMilliseconds() / 10)).padStart(2, '0');

        let timeString = `${h}:${m}:${s}`;
        if (d > 0) {
            timeString = `${d}d ` + timeString;
        }

        this.display.childNodes[0].nodeValue = timeString;
        if (this.millisecondsEl) this.millisecondsEl.textContent = `.${ms}`;
    }

    toggleButtons() {
        if (this.isRunning) {
            this.startBtn.classList.add('hidden');
            this.pauseBtn.classList.remove('hidden');
        } else {
            this.startBtn.classList.remove('hidden');
            this.pauseBtn.classList.add('hidden');
        }
    }
}

/**
 * Timer Implementation
 */
class Timer extends TimeKeeper {
    constructor(existingData = null) {
        super('timer', 'timer-template', existingData);
        // Updated selector for new HTML structure
        this.inputContainer = this.element.querySelector('.timer-input-wrapper');
        this.inputs = {
            d: this.element.querySelector('.days'),
            h: this.element.querySelector('.hours'),
            m: this.element.querySelector('.minutes'),
            s: this.element.querySelector('.seconds')
        };

        // Hydrate Timer specific props
        this.targetTime = existingData ? existingData.targetTime : 0;
        this.remainingTime = existingData ? existingData.remainingTime : 0;
        this.originalDuration = existingData ? existingData.originalDuration : 0;

        // Restore UI State
        if (this.isRunning || this.remainingTime > 0) {
            this.inputContainer.classList.add('hidden');
            this.display.classList.remove('hidden');

            if (this.isRunning) {
                // If running, we calculate display based on target
                const left = this.targetTime - Date.now();
                if (left <= 0) {
                    this.complete();
                } else {
                    this.updateDisplay(left);
                    this.start(true); // Auto-resume
                }
            } else {
                // If paused, show remaining
                this.updateDisplay(this.remainingTime);
                this.toggleButtons(); // Ensure buttons show "Start" not "Pause"
            }
        }
    }

    start(isResume = false) {
        if (!isResume) {
            if (this.isRunning) return;

            // New Timer Start from Inputs
            if (this.remainingTime === 0 && this.targetTime === 0) {
                const d = parseInt(this.inputs.d.value) || 0;
                const h = parseInt(this.inputs.h.value) || 0;
                const m = parseInt(this.inputs.m.value) || 0;
                const s = parseInt(this.inputs.s.value) || 0;
                this.originalDuration = (d * 86400 + h * 3600 + m * 60 + s) * 1000;
                this.remainingTime = this.originalDuration;

                if (this.remainingTime <= 0) return;
            }

            this.isRunning = true;
            this.targetTime = Date.now() + this.remainingTime;
            triggerSave();
        }

        // UI Updates for Running State
        this.inputContainer.classList.add('hidden');
        this.display.classList.remove('hidden');
        this.element.classList.add('running-timer');

        this.toggleButtons();
        // Use requestAnimationFrame for smoother updates, matching Stopwatch logic
        this.interval = requestAnimationFrame(this.tick.bind(this));
    }

    stop() {
        if (!this.isRunning) return;
        this.isRunning = false;
        cancelAnimationFrame(this.interval);

        // Save state
        this.remainingTime = Math.max(0, this.targetTime - Date.now());

        this.element.classList.remove('running-timer');
        this.toggleButtons();
        triggerSave();
    }

    reset() {
        this.stop();
        this.remainingTime = 0;
        this.targetTime = 0;
        this.originalDuration = 0;

        this.inputContainer.classList.remove('hidden');
        this.display.classList.add('hidden');
        this.inputs.d.value = '';
        this.inputs.h.value = '';
        this.inputs.m.value = '';
        this.inputs.s.value = '';
        triggerSave();
    }

    tick() {
        if (!this.isRunning) return;

        const now = Date.now();
        const left = this.targetTime - now;

        if (left <= 0) {
            this.complete();
            return;
        }

        this.updateDisplay(left);
        this.interval = requestAnimationFrame(this.tick.bind(this));
    }

    complete() {
        this.stop();
        this.updateDisplay(0);
        this.remainingTime = 0;
        this.display.style.color = 'var(--timer-color)';
        setTimeout(() => this.display.style.color = '', 2000);
    }

    updateDisplay(ms) {
        const totalSeconds = Math.ceil(ms / 1000);
        const d = Math.floor(totalSeconds / 86400);
        const h = Math.floor((totalSeconds % 86400) / 3600);
        const m = Math.floor((totalSeconds % 3600) / 60);
        const s = totalSeconds % 60;

        let timeString = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        // Show days if > 0 OR if original duration had days (to prevent jumping layout)
        // But dynamic is safer. User asked for day support.
        if (d > 0) {
            timeString = `${d}d ` + timeString;
        }

        this.display.textContent = timeString;
    }

    toggleButtons() {
        try {
            if (this.isRunning) {
                this.startBtn.classList.add('hidden');
                this.pauseBtn.classList.remove('hidden');
                if (this.inputs.d) this.inputs.d.disabled = true;
                if (this.inputs.h) this.inputs.h.disabled = true;
                if (this.inputs.m) this.inputs.m.disabled = true;
                if (this.inputs.s) this.inputs.s.disabled = true;
            } else {
                this.startBtn.classList.remove('hidden');
                this.pauseBtn.classList.add('hidden');
                if (this.inputs.d) this.inputs.d.disabled = false;
                if (this.inputs.h) this.inputs.h.disabled = false;
                if (this.inputs.m) this.inputs.m.disabled = false;
                if (this.inputs.s) this.inputs.s.disabled = false;
            }
        } catch (e) {
            console.warn("Toggle Buttons failed", e);
        }
    }
}


// Event Listeners for Global Actions
addStopwatchBtn.addEventListener('click', () => {
    const sw = new Stopwatch();
    instances.push(sw);
    triggerSave();
});

addTimerBtn.addEventListener('click', () => {
    const tm = new Timer();
    instances.push(tm);
    triggerSave();
});

// Auth Flow
authBtn.addEventListener('click', () => {
    signInWithPopup(auth, provider)
        .then((result) => {
            console.log("Logged in:", result.user);
            // User listener will handle the UI update
        }).catch((error) => {
            console.error(error);
            alert("Login Failed: " + error.message);
        });
});

logoutBtn.addEventListener('click', () => {
    signOut(auth).then(() => {
        console.log("Logged out");
        // User listener will handle UI
    });
});

// Auth State Listener
onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    if (user) {
        // UI Updates
        authBtn.classList.add('hidden');
        userInfo.classList.remove('hidden');
        userNameDisplay.textContent = user.displayName;
        userAvatar.src = user.photoURL;

        // Sync Logic
        // 1. Load cloud data
        const docRef = doc(db, "users", user.uid);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const cloudData = docSnap.data().timers;
            // Strategy: Merge or Replace? 
            if (confirm("Cloud save found! Load it? (This will replace current stopwatches)")) {
                stopwatchGrid.innerHTML = '';
                instances = [];
                cloudData.forEach(data => {
                    if (data.type === 'stopwatch') instances.push(new Stopwatch(data));
                    else instances.push(new Timer(data));
                });
                triggerSave(); // Save this new state to local
            }
        }
    } else {
        authBtn.classList.remove('hidden');
        userInfo.classList.add('hidden');
    }
});


// Initialization
const init = () => {
    const savedData = loadFromLocal();
    if (savedData && savedData.length > 0) {
        savedData.forEach(data => {
            if (data.type === 'stopwatch') {
                instances.push(new Stopwatch(data));
            } else if (data.type === 'timer') {
                instances.push(new Timer(data));
            }
        });
    } else {
        // Default start
        const initialSw = new Stopwatch();
        instances.push(initialSw);
        triggerSave();
    }
};

init();
