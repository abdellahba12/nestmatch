// ZoneMap — Interactive zone picker for register step 3
const ZoneMap = {
  selectedZones: [],

  // Popular zones per city
  zones: {
    'barcelona': [
      { name: 'Gràcia', x: 48, y: 35 },
      { name: 'Eixample', x: 42, y: 48 },
      { name: 'Poble Sec', x: 38, y: 58 },
      { name: 'Poblenou', x: 65, y: 50 },
      { name: 'Sant Martí', x: 72, y: 45 },
      { name: 'Sants', x: 28, y: 55 },
      { name: 'Les Corts', x: 22, y: 45 },
      { name: 'Sarrià', x: 18, y: 30 },
      { name: 'Horta', x: 55, y: 22 },
      { name: 'Nou Barris', x: 42, y: 18 },
      { name: 'Sant Andreu', x: 62, y: 28 },
      { name: 'Clot', x: 62, y: 38 },
    ],
    'madrid': [
      { name: 'Malasaña', x: 45, y: 38 },
      { name: 'Lavapiés', x: 50, y: 52 },
      { name: 'Chueca', x: 52, y: 35 },
      { name: 'Chamberí', x: 44, y: 28 },
      { name: 'Retiro', x: 60, y: 48 },
      { name: 'Salamanca', x: 62, y: 35 },
      { name: 'Carabanchel', x: 38, y: 68 },
      { name: 'Vallecas', x: 68, y: 65 },
      { name: 'Moncloa', x: 28, y: 35 },
      { name: 'Arganzuela', x: 48, y: 60 },
      { name: 'Centro', x: 48, y: 48 },
      { name: 'Tetuán', x: 48, y: 22 },
    ],
    'valencia': [
      { name: 'Ruzafa', x: 52, y: 55 },
      { name: 'El Carmen', x: 45, y: 42 },
      { name: 'Benimaclet', x: 62, y: 28 },
      { name: 'Algirós', x: 65, y: 38 },
      { name: 'Malvarrosa', x: 75, y: 30 },
      { name: 'Patraix', x: 35, y: 62 },
      { name: 'Jesús', x: 48, y: 65 },
      { name: 'Campanar', x: 28, y: 35 },
      { name: 'Extramurs', x: 40, y: 52 },
    ],
    'sevilla': [
      { name: 'Triana', x: 35, y: 48 },
      { name: 'Casco Antiguo', x: 48, y: 42 },
      { name: 'Nervión', x: 58, y: 35 },
      { name: 'Los Remedios', x: 38, y: 58 },
      { name: 'La Macarena', x: 50, y: 28 },
      { name: 'Cerro-Amate', x: 62, y: 55 },
    ],
    'bilbao': [
      { name: 'Casco Viejo', x: 48, y: 45 },
      { name: 'Abando', x: 45, y: 38 },
      { name: 'Deusto', x: 35, y: 40 },
      { name: 'Santutxu', x: 55, y: 30 },
      { name: 'Begoña', x: 50, y: 28 },
    ],
    'default': [
      { name: 'Centro', x: 50, y: 50 },
      { name: 'Norte', x: 50, y: 25 },
      { name: 'Sur', x: 50, y: 75 },
      { name: 'Este', x: 75, y: 50 },
      { name: 'Oeste', x: 25, y: 50 },
    ]
  },

  currentCity: 'default',
  allZones: [],

  init() {
    // Watch city input changes
    const cityInput = document.getElementById('reg-city');
    if (cityInput) {
      cityInput.addEventListener('input', () => {
        this.updateCity(cityInput.value.trim().toLowerCase());
      });
      // Init with current value
      if (cityInput.value) this.updateCity(cityInput.value.trim().toLowerCase());
    }
    this.render();
  },

  updateCity(cityRaw) {
    const cityKey = Object.keys(this.zones).find(k => cityRaw.includes(k)) || 'default';
    if (cityKey !== this.currentCity) {
      this.currentCity = cityKey;
      this.render();
    }
    const label = document.getElementById('zmp-city-name');
    if (label) label.textContent = cityRaw || 'tu ciudad';
    const mapCity = document.getElementById('zmp-map-city');
    if (mapCity) mapCity.textContent = cityRaw ? cityRaw.charAt(0).toUpperCase() + cityRaw.slice(1) : '';
  },

  render() {
    const zones = this.zones[this.currentCity] || this.zones['default'];
    this.allZones = zones;

    // Render popular chips
    const chips = document.getElementById('zmp-chips');
    if (chips) {
      chips.innerHTML = zones.map(z =>
        `<button type="button" class="zmp-chip ${this.selectedZones.includes(z.name) ? 'selected' : ''}"
          onclick="ZoneMap.toggle('${z.name}')">${z.name}</button>`
      ).join('');
    }

    // Render map dots
    const mapInner = document.getElementById('zmp-map-inner');
    if (mapInner) {
      const existingDots = mapInner.querySelectorAll('.zmp-dot');
      existingDots.forEach(d => d.remove());

      zones.forEach(z => {
        const dot = document.createElement('div');
        dot.className = `zmp-dot ${this.selectedZones.includes(z.name) ? 'selected' : ''}`;
        dot.style.left = z.x + '%';
        dot.style.top = z.y + '%';
        dot.innerHTML = `<div class="zmp-dot-pulse"></div><div class="zmp-dot-label">${z.name}</div>`;
        dot.onclick = () => this.toggle(z.name);
        mapInner.appendChild(dot);
      });
    }

    this.renderTags();
  },

  toggle(name) {
    if (this.selectedZones.includes(name)) {
      this.selectedZones = this.selectedZones.filter(z => z !== name);
    } else {
      this.selectedZones.push(name);
    }
    // Sync to App.regZones
    App.regZones = [...this.selectedZones];
    this.render();
  },

  renderTags() {
    const container = document.getElementById('zones-tags');
    if (!container) return;
    container.innerHTML = this.selectedZones.map(z =>
      `<span class="tag">${z}<button class="tag-remove" type="button" onclick="ZoneMap.toggle('${z}')">×</button></span>`
    ).join('');
  },

  search(query) {
    const suggestions = document.getElementById('zmp-suggestions');
    if (!query || query.length < 2) {
      suggestions.classList.add('hidden');
      return;
    }
    const matches = this.allZones.filter(z =>
      z.name.toLowerCase().includes(query.toLowerCase())
    );
    if (matches.length === 0) {
      suggestions.classList.add('hidden');
      return;
    }
    suggestions.innerHTML = matches.map(z =>
      `<div class="zmp-suggestion" onclick="ZoneMap.selectSuggestion('${z.name}')">${z.name}</div>`
    ).join('');
    suggestions.classList.remove('hidden');
  },

  selectSuggestion(name) {
    const input = document.getElementById('zone-input');
    if (input) input.value = '';
    const suggestions = document.getElementById('zmp-suggestions');
    if (suggestions) suggestions.classList.add('hidden');
    if (!this.selectedZones.includes(name)) this.toggle(name);
  },

  addFromInput() {
    const input = document.getElementById('zone-input');
    const val = input ? input.value.trim() : '';
    if (!val) return;
    if (!this.selectedZones.includes(val)) {
      this.selectedZones.push(val);
      App.regZones = [...this.selectedZones];
      this.render();
    }
    if (input) input.value = '';
    const suggestions = document.getElementById('zmp-suggestions');
    if (suggestions) suggestions.classList.add('hidden');
  }
};

// Initialize when DOM is ready, but only on register page
document.addEventListener('DOMContentLoaded', () => {
  // Will be called again when register page is shown
});
