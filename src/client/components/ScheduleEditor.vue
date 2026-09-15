<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal">
      <h3 class="modal-title">Schedule — {{ zone.name }}</h3>

      <div class="field">
        <label>Start Time</label>
        <input v-model="draft.startTime" type="time" />
      </div>

      <div class="field">
        <label>Duration (minutes)</label>
        <input v-model.number="draft.duration" type="number" min="1" max="120" />
      </div>

      <div class="field">
        <label>Frequency</label>
        <div class="mode-picker">
          <label class="mode-option">
            <input type="radio" value="weekly" v-model="draft.mode" />
            Specific days
          </label>
          <label class="mode-option">
            <input type="radio" value="interval" v-model="draft.mode" />
            Every N days
          </label>
        </div>
      </div>

      <div class="field" v-if="draft.mode === 'weekly'">
        <label>Watering Days</label>
        <div class="day-picker">
          <label
            v-for="day in allDays"
            :key="day.key"
            class="day-chip"
            :class="{ selected: draft.days.includes(day.key) }"
          >
            <input
              type="checkbox"
              :value="day.key"
              v-model="draft.days"
              class="sr-only"
            />
            {{ day.label }}
          </label>
        </div>
      </div>

      <div class="field" v-else>
        <label>Water every</label>
        <div class="interval-row">
          <input v-model.number="draft.intervalDays" type="number" min="1" max="365" />
          <span>day(s), starting</span>
          <input v-model="draft.anchorDate" type="date" />
        </div>
      </div>

      <div v-if="error" class="error-msg">{{ error }}</div>

      <div class="modal-actions">
        <button class="btn btn-save" @click="save">Save</button>
        <button class="btn btn-cancel" @click="$emit('close')">Cancel</button>
      </div>
    </div>
  </div>
</template>

<script>
const ALL_DAYS = [
  { key: 'mon', label: 'Mon' },
  { key: 'tue', label: 'Tue' },
  { key: 'wed', label: 'Wed' },
  { key: 'thu', label: 'Thu' },
  { key: 'fri', label: 'Fri' },
  { key: 'sat', label: 'Sat' },
  { key: 'sun', label: 'Sun' },
];

export default {
  name: 'ScheduleEditor',
  props: {
    zone: {
      type: Object,
      required: true,
    },
  },
  emits: ['close', 'saved'],
  data() {
    const today = new Date().toISOString().slice(0, 10);
    return {
      allDays: ALL_DAYS,
      draft: {
        mode: this.zone.schedule.mode || 'weekly',
        startTime: this.zone.schedule.startTime,
        duration: this.zone.schedule.duration,
        days: [...(this.zone.schedule.days || [])],
        intervalDays: this.zone.schedule.intervalDays || 1,
        anchorDate: this.zone.schedule.anchorDate || today,
      },
      error: null,
    };
  },
  methods: {
    async save() {
      this.error = null;
      if (!this.draft.startTime) {
        this.error = 'Please select a start time.';
        return;
      }
      if (this.draft.duration < 1) {
        this.error = 'Duration must be at least 1 minute.';
        return;
      }
      if (this.draft.mode === 'weekly' && !this.draft.days.length) {
        this.error = 'Select at least one day.';
        return;
      }
      if (this.draft.mode === 'interval') {
        if (!this.draft.intervalDays || this.draft.intervalDays < 1) {
          this.error = 'Enter a frequency of at least 1 day.';
          return;
        }
        if (!this.draft.anchorDate) {
          this.error = 'Select a start date.';
          return;
        }
      }

      const payload =
        this.draft.mode === 'interval'
          ? {
              mode: 'interval',
              startTime: this.draft.startTime,
              duration: this.draft.duration,
              intervalDays: this.draft.intervalDays,
              anchorDate: this.draft.anchorDate,
            }
          : {
              mode: 'weekly',
              startTime: this.draft.startTime,
              duration: this.draft.duration,
              days: this.draft.days,
            };

      try {
        const res = await fetch(`/api/zones/${this.zone.id}/schedule`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const body = await res.json();
          this.error = body.error || 'Failed to save schedule.';
          return;
        }
        this.$emit('saved', this.zone.id, await res.json());
      } catch (err) {
        this.error = err.message;
      }
    },
  },
};
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.modal {
  background: var(--card-bg, #fff);
  border-radius: 10px;
  padding: 1.5rem;
  width: min(420px, 90vw);
  display: flex;
  flex-direction: column;
  gap: 1rem;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}

.modal-title {
  margin: 0;
  font-size: 1.1rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.field label {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text-muted, #666);
}

.field input[type='time'],
.field input[type='number'] {
  padding: 0.4rem 0.6rem;
  border: 1px solid var(--border, #ccc);
  border-radius: 5px;
  font-size: 0.95rem;
  width: 100%;
  box-sizing: border-box;
}

.day-picker {
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
}

.mode-picker {
  display: flex;
  gap: 1rem;
}

.mode-option {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.88rem;
  font-weight: normal;
  color: var(--text, #333);
  cursor: pointer;
}

.interval-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  font-size: 0.88rem;
}

.interval-row input[type='number'] {
  width: 4.5rem;
  padding: 0.4rem 0.6rem;
  border: 1px solid var(--border, #ccc);
  border-radius: 5px;
  font-size: 0.95rem;
}

.interval-row input[type='date'] {
  padding: 0.35rem 0.5rem;
  border: 1px solid var(--border, #ccc);
  border-radius: 5px;
  font-size: 0.9rem;
}

.day-chip {
  padding: 0.3rem 0.7rem;
  border-radius: 20px;
  border: 1px solid var(--border, #ccc);
  cursor: pointer;
  font-size: 0.82rem;
  user-select: none;
  transition: background 0.15s, color 0.15s;
}

.day-chip.selected {
  background: var(--color-primary, #1976d2);
  color: #fff;
  border-color: var(--color-primary, #1976d2);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

.error-msg {
  color: var(--color-danger, #f44336);
  font-size: 0.85rem;
}

.modal-actions {
  display: flex;
  gap: 0.6rem;
  justify-content: flex-end;
}

.btn {
  padding: 0.45rem 1rem;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  font-size: 0.88rem;
  font-weight: 500;
}

.btn-save {
  background: var(--color-primary, #1976d2);
  color: #fff;
}

.btn-cancel {
  background: var(--color-off-bg, #e0e0e0);
  color: var(--text, #333);
}
</style>
