<template>
  <div class="zone-card" :class="{ active: zone.active, disabled: !zone.enabled }">
    <div class="zone-header">
      <span class="zone-name">{{ zone.name }}</span>
      <span class="zone-badge" :class="zone.active ? 'badge-on' : 'badge-off'">
        {{ zone.active ? 'ON' : 'OFF' }}
      </span>
    </div>

    <div class="zone-meta">
      <span class="zone-pin">Channel {{ zone.channel }}</span>
      <label class="zone-toggle-label">
        <input
          type="checkbox"
          :checked="zone.enabled"
          @change="$emit('toggle-enabled', zone.id, $event.target.checked)"
        />
        Enabled
      </label>
    </div>

    <div class="zone-schedule-summary">
      <span>⏰ {{ zone.schedule.startTime }}</span>
      <span>⏱ {{ zone.schedule.duration }} min</span>
      <span>📅 {{ scheduleDays }}</span>
    </div>

    <div class="zone-actions">
      <button
        class="btn btn-on"
        :disabled="zone.active || !zone.enabled"
        @click="$emit('turn-on', zone.id)"
      >
        Water Now
      </button>
      <button
        class="btn btn-off"
        :disabled="!zone.active"
        @click="$emit('turn-off', zone.id)"
      >
        Stop
      </button>
      <button class="btn btn-edit" @click="$emit('edit-schedule', zone.id)">
        Schedule
      </button>
    </div>
  </div>
</template>

<script>
const DAY_LABELS = { sun: 'Su', mon: 'Mo', tue: 'Tu', wed: 'We', thu: 'Th', fri: 'Fr', sat: 'Sa' };

export default {
  name: 'ZoneCard',
  props: {
    zone: {
      type: Object,
      required: true,
    },
  },
  emits: ['turn-on', 'turn-off', 'toggle-enabled', 'edit-schedule'],
  computed: {
    scheduleDays() {
      return (this.zone.schedule.days || []).map((d) => DAY_LABELS[d] || d).join(' ');
    },
  },
};
</script>

<style scoped>
.zone-card {
  background: var(--card-bg, #fff);
  border: 1px solid var(--border, #e0e0e0);
  border-radius: 8px;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  transition: box-shadow 0.2s;
}

.zone-card.active {
  border-color: var(--color-on, #4caf50);
  box-shadow: 0 0 0 3px rgba(76, 175, 80, 0.2);
}

.zone-card.disabled {
  opacity: 0.55;
}

.zone-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.zone-name {
  font-weight: 600;
  font-size: 1rem;
}

.zone-badge {
  font-size: 0.7rem;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 12px;
  letter-spacing: 0.05em;
}

.badge-on {
  background: var(--color-on, #4caf50);
  color: #fff;
}

.badge-off {
  background: var(--color-off-bg, #e0e0e0);
  color: var(--color-off-text, #666);
}

.zone-meta {
  display: flex;
  gap: 1rem;
  align-items: center;
  font-size: 0.8rem;
  color: var(--text-muted, #888);
}

.zone-toggle-label {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  cursor: pointer;
  color: inherit;
}

.zone-schedule-summary {
  display: flex;
  gap: 0.8rem;
  font-size: 0.82rem;
  color: var(--text-muted, #888);
  flex-wrap: wrap;
}

.zone-actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.btn {
  padding: 0.35rem 0.8rem;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  font-size: 0.82rem;
  font-weight: 500;
  transition: opacity 0.15s;
}

.btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.btn-on {
  background: var(--color-on, #4caf50);
  color: #fff;
}

.btn-off {
  background: var(--color-danger, #f44336);
  color: #fff;
}

.btn-edit {
  background: var(--color-primary, #1976d2);
  color: #fff;
}
</style>
