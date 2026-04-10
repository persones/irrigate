<template>
  <div class="sensor-panel">
    <h2 class="panel-title">Sensor Data</h2>

    <div v-if="loading" class="loading">Loading sensor data…</div>
    <div v-else-if="fetchError" class="error-msg">{{ fetchError }}</div>
    <div v-else class="sensor-grid">
      <!-- Soil moisture -->
      <div class="sensor-card">
        <div class="sensor-icon">🌱</div>
        <div class="sensor-label">Soil Moisture</div>
        <div class="sensor-value" :class="moistureClass">
          {{ soilMoisture !== null ? soilMoisture + '%' : '—' }}
        </div>
        <div class="sensor-sub">{{ moistureDescription }}</div>
      </div>

      <!-- Recent rain -->
      <div class="sensor-card">
        <div class="sensor-icon">🌧</div>
        <div class="sensor-label">Recent Rain</div>
        <div class="sensor-value">
          {{ weather ? weather.recentRainMm + ' mm' : '—' }}
        </div>
        <div class="sensor-sub">{{ weather ? weather.description : 'No data' }}</div>
      </div>

      <!-- Today forecast -->
      <div class="sensor-card">
        <div class="sensor-icon">☀️</div>
        <div class="sensor-label">Today Rain</div>
        <div class="sensor-value">
          {{ weather ? weather.todayRainMm + ' mm' : '—' }}
        </div>
        <div class="sensor-sub">Forecast</div>
      </div>
    </div>

    <button class="btn-refresh" @click="load">↻ Refresh</button>
  </div>
</template>

<script>
export default {
  name: 'SensorPanel',
  data() {
    return {
      soilMoisture: null,
      weather: null,
      loading: true,
      fetchError: null,
    };
  },
  computed: {
    moistureClass() {
      if (this.soilMoisture === null) return '';
      if (this.soilMoisture < 30) return 'val-low';
      if (this.soilMoisture < 60) return 'val-medium';
      return 'val-high';
    },
    moistureDescription() {
      if (this.soilMoisture === null) return 'No data';
      if (this.soilMoisture < 30) return 'Dry – watering needed';
      if (this.soilMoisture < 60) return 'Adequate';
      return 'Well watered';
    },
  },
  mounted() {
    this.load();
  },
  methods: {
    async load() {
      this.loading = true;
      this.fetchError = null;
      try {
        const res = await fetch('/api/sensors');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        this.soilMoisture = data.soilMoisture;
        this.weather = data.weather;
      } catch (err) {
        this.fetchError = 'Could not load sensor data: ' + err.message;
      } finally {
        this.loading = false;
      }
    },
  },
};
</script>

<style scoped>
.sensor-panel {
  background: var(--card-bg, #fff);
  border: 1px solid var(--border, #e0e0e0);
  border-radius: 8px;
  padding: 1rem 1.2rem;
}

.panel-title {
  margin: 0 0 0.8rem;
  font-size: 1rem;
  font-weight: 600;
}

.loading,
.error-msg {
  font-size: 0.9rem;
  color: var(--text-muted, #888);
  padding: 0.5rem 0;
}

.error-msg {
  color: var(--color-danger, #f44336);
}

.sensor-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 0.8rem;
}

.sensor-card {
  background: var(--surface-2, #f9f9f9);
  border-radius: 6px;
  padding: 0.7rem;
  text-align: center;
}

.sensor-icon {
  font-size: 1.6rem;
  margin-bottom: 0.2rem;
}

.sensor-label {
  font-size: 0.75rem;
  color: var(--text-muted, #888);
  margin-bottom: 0.2rem;
}

.sensor-value {
  font-size: 1.3rem;
  font-weight: 700;
  color: var(--text, #222);
}

.val-low {
  color: var(--color-danger, #f44336);
}

.val-medium {
  color: var(--color-warn, #ff9800);
}

.val-high {
  color: var(--color-on, #4caf50);
}

.sensor-sub {
  font-size: 0.72rem;
  color: var(--text-muted, #aaa);
  margin-top: 0.1rem;
}

.btn-refresh {
  margin-top: 0.8rem;
  background: none;
  border: 1px solid var(--border, #ccc);
  border-radius: 5px;
  padding: 0.3rem 0.8rem;
  cursor: pointer;
  font-size: 0.82rem;
  color: var(--text-muted, #666);
}

.btn-refresh:hover {
  background: var(--surface-2, #f0f0f0);
}
</style>
