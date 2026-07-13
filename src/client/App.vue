<template>
  <div class="app">
    <header class="app-header">
      <div class="header-content">
        <div>
          <h1 class="app-title">💧 Irrigate</h1>
          <span class="app-subtitle">ESP32 Feather Controller + MQTT Server</span>
        </div>
        <div class="controller-indicator" :class="controllerIndicatorClass">
          <span class="controller-dot" aria-hidden="true"></span>
          {{ controllerIndicatorText }}
        </div>
      </div>
    </header>

    <main class="app-main">
      <!-- Sensor panel -->
      <SensorPanel />

      <!-- Zones section -->
      <section class="zones-section">
        <div class="section-header">
          <h2 class="section-title">Zones</h2>
          <button class="btn-add" @click="showAddZone = true">+ Add Zone</button>
        </div>

        <div v-if="loading" class="loading">Loading zones…</div>
        <div v-else-if="fetchError" class="error-msg">{{ fetchError }}</div>
        <div v-else-if="!zones.length" class="empty-msg">
          No zones configured. Add a zone to get started.
        </div>
        <div v-else class="zones-grid">
          <ZoneCard
            v-for="zone in zones"
            :key="zone.id"
            :zone="zone"
            @turn-on="turnOn"
            @turn-off="turnOff"
            @toggle-enabled="toggleEnabled"
            @edit-schedule="openScheduleEditor"
          />
        </div>
      </section>

      <!-- Add zone form -->
      <div v-if="showAddZone" class="modal-overlay" @click.self="showAddZone = false">
        <div class="modal">
          <h3 class="modal-title">Add Zone</h3>
          <div class="field">
            <label>Name</label>
            <input v-model="newZone.name" type="text" placeholder="e.g. Front Yard" />
          </div>
          <div class="field">
            <label>Relay Channel</label>
            <input v-model.number="newZone.channel" type="number" min="1" max="8" />
          </div>
          <div v-if="addError" class="error-msg">{{ addError }}</div>
          <div class="modal-actions">
            <button class="btn btn-save" @click="addZone">Add</button>
            <button class="btn btn-cancel" @click="showAddZone = false">Cancel</button>
          </div>
        </div>
      </div>

      <!-- Schedule editor modal -->
      <ScheduleEditor
        v-if="editingZone"
        :zone="editingZone"
        @close="editingZone = null"
        @saved="onScheduleSaved"
      />
    </main>
  </div>
</template>

<script>
import ZoneCard from './components/ZoneCard.vue';
import ScheduleEditor from './components/ScheduleEditor.vue';
import SensorPanel from './components/SensorPanel.vue';

const DEFAULT_CHANNEL = 1;

const DEFAULT_SCHEDULE = {
  days: ['mon', 'wed', 'fri'],
  startTime: '06:00',
  duration: 15,
};

export default {
  name: 'App',
  components: { ZoneCard, ScheduleEditor, SensorPanel },
  data() {
    return {
      zones: [],
      controllerFound: null,
      loading: true,
      fetchError: null,
      editingZone: null,
      showAddZone: false,
      addError: null,
      newZone: { name: '', channel: DEFAULT_CHANNEL, schedule: { ...DEFAULT_SCHEDULE, days: [...DEFAULT_SCHEDULE.days] } },
    };
  },
  computed: {
    controllerIndicatorClass() {
      if (this.controllerFound === null) {
        return 'status-searching';
      }
      return this.controllerFound ? 'status-found' : 'status-not-found';
    },
    controllerIndicatorText() {
      if (this.controllerFound === null) {
        return 'Controller: searching';
      }
      return this.controllerFound ? 'Controller: found' : 'Controller: not found';
    },
  },
  async mounted() {
    await Promise.all([this.loadZones(), this.loadControllerStatus()]);
    // Poll zone status every 10 seconds to keep active badges current
    this.pollTimer = setInterval(this.loadZones, 10000);
    this.controllerPollTimer = setInterval(this.loadControllerStatus, 5000);
  },
  beforeUnmount() {
    clearInterval(this.pollTimer);
    clearInterval(this.controllerPollTimer);
  },
  methods: {
    async loadZones() {
      try {
        const res = await fetch('/api/zones');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        this.zones = await res.json();
        this.fetchError = null;
      } catch (err) {
        this.fetchError = 'Could not load zones: ' + err.message;
      } finally {
        this.loading = false;
      }
    },

    async loadControllerStatus() {
      try {
        const res = await fetch('/api/status');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();
        const availability = String(data?.mqtt?.availability || '').toLowerCase();
        const hasControllerState = Boolean(data?.mqtt?.controller);
        this.controllerFound = availability === 'online' || hasControllerState;
      } catch (_err) {
        this.controllerFound = false;
      }
    },

    async turnOn(id) {
      try {
        const res = await fetch(`/api/zones/${id}/on`, { method: 'POST' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await this.loadZones();
      } catch (err) {
        this.fetchError = 'Could not turn zone on: ' + err.message;
      }
    },

    async turnOff(id) {
      try {
        const res = await fetch(`/api/zones/${id}/off`, { method: 'POST' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await this.loadZones();
      } catch (err) {
        this.fetchError = 'Could not turn zone off: ' + err.message;
      }
    },

    async toggleEnabled(id, enabled) {
      try {
        const res = await fetch(`/api/zones/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await this.loadZones();
      } catch (err) {
        this.fetchError = 'Could not update zone: ' + err.message;
      }
    },

    openScheduleEditor(id) {
      this.editingZone = this.zones.find((z) => z.id === id) || null;
    },

    onScheduleSaved(id, schedule) {
      const zone = this.zones.find((z) => z.id === id);
      if (zone) zone.schedule = schedule;
      this.editingZone = null;
    },

    async addZone() {
      this.addError = null;
      if (!this.newZone.name.trim()) {
        this.addError = 'Name is required.';
        return;
      }
      if (!Number.isInteger(this.newZone.channel) || this.newZone.channel < 1 || this.newZone.channel > 8) {
        this.addError = 'Channel must be an integer between 1 and 8.';
        return;
      }
      try {
        const res = await fetch('/api/zones', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(this.newZone),
        });
        if (!res.ok) {
          const body = await res.json();
          this.addError = body.error || 'Failed to add zone.';
          return;
        }
        this.showAddZone = false;
        this.newZone = { name: '', channel: DEFAULT_CHANNEL, schedule: { ...DEFAULT_SCHEDULE, days: [...DEFAULT_SCHEDULE.days] } };
        await this.loadZones();
      } catch (err) {
        this.addError = err.message;
      }
    },
  },
};
</script>

<style>
/* Global styles */
*, *::before, *::after { box-sizing: border-box; }

:root {
  --color-primary: #1976d2;
  --color-on: #4caf50;
  --color-danger: #f44336;
  --color-warn: #ff9800;
  --color-off-bg: #e8e8e8;
  --color-off-text: #666;
  --card-bg: #ffffff;
  --surface-2: #f5f7fa;
  --border: #e0e0e0;
  --text: #1a1a2e;
  --text-muted: #888;
  --header-bg: #1565c0;
}

body {
  margin: 0;
  font-family: 'Noto Sans', system-ui, sans-serif;
  background: var(--surface-2);
  color: var(--text);
  min-height: 100vh;
}
</style>

<style scoped>
.app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.app-header {
  background: var(--header-bg, #1565c0);
  color: #fff;
  padding: 0.8rem 1.5rem;
  box-shadow: 0 2px 6px rgba(0,0,0,0.2);
}

.header-content {
  max-width: 1100px;
  margin: 0 auto;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.8rem;
}

.app-title {
  margin: 0;
  font-size: 1.4rem;
  font-weight: 700;
}

.app-subtitle {
  font-size: 0.82rem;
  opacity: 0.8;
}

.controller-indicator {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  border-radius: 999px;
  padding: 0.28rem 0.7rem;
  font-size: 0.8rem;
  font-weight: 600;
  border: 1px solid transparent;
}

.controller-dot {
  width: 0.52rem;
  height: 0.52rem;
  border-radius: 50%;
  background: currentColor;
}

.status-found {
  color: #dfffe6;
  background: rgba(46, 125, 50, 0.35);
  border-color: rgba(165, 214, 167, 0.65);
}

.status-not-found {
  color: #ffe2e2;
  background: rgba(198, 40, 40, 0.35);
  border-color: rgba(239, 154, 154, 0.6);
}

.status-searching {
  color: #fff8dc;
  background: rgba(245, 127, 23, 0.35);
  border-color: rgba(255, 224, 178, 0.7);
}

.app-main {
  max-width: 1100px;
  margin: 1.5rem auto;
  padding: 0 1rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  width: 100%;
}

.zones-section {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.section-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
}

.btn-add {
  background: var(--color-primary);
  color: #fff;
  border: none;
  border-radius: 5px;
  padding: 0.35rem 0.9rem;
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: 500;
}

.zones-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1rem;
}

.loading, .empty-msg {
  color: var(--text-muted);
  font-size: 0.9rem;
  padding: 0.5rem 0;
}

.error-msg {
  color: var(--color-danger);
  font-size: 0.88rem;
}

/* Shared modal styles (duplicated from ScheduleEditor for the Add Zone modal) */
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
  width: min(400px, 90vw);
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

.field input {
  padding: 0.4rem 0.6rem;
  border: 1px solid var(--border, #ccc);
  border-radius: 5px;
  font-size: 0.95rem;
  width: 100%;
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

.btn-save { background: var(--color-primary); color: #fff; }
.btn-cancel { background: var(--color-off-bg); color: var(--text); }

@media (max-width: 640px) {
  .header-content {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
