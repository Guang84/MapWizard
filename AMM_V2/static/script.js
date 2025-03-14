class MapManager {
    static EPSILON = 0.000001;

    constructor() {
        this.map = null;
        this.mode = 'pin';
        this.measurePoints = [];
        this.measureMarkers = [];
        this.measurePolylines = [];
        this.totalDistance = 0;
        this.totalArea = 0;
        this.currentPinLocation = null;
        this.markers = [];
        this.undoStack = [];
        this.redoStack = [];
    }

    initMap() {
        // Initialize the map
        this.map = new google.maps.Map(document.getElementById("map"), {
            center: { lat: 24.857558, lng: 93.623283 },
            zoom: 14,
            mapTypeId: 'roadmap',
            styles: [
                {
                    "featureType": "all",
                    "elementType": "geometry",
                    "stylers": [{ "color": "#f3f4f4" }]
                },
                {
                    "featureType": "road",
                    "elementType": "geometry",
                    "stylers": [{ "color": "#d6d6d6" }]
                },
                {
                    "featureType": "poi.park",
                    "elementType": "geometry",
                    "stylers": [{ "color": "#b9e5a2" }]
                }
            ]
        });

        this.setupEventListeners();
        this.loadSavedLocations(); // Load JSON data on map initialization
    }

    setupEventListeners() {
        document.getElementById('pin-mode').addEventListener('click', () => this.setMode('pin'));
        document.getElementById('measure-mode').addEventListener('click', () => this.setMode('measure'));
        document.getElementById('area-mode').addEventListener('click', () => this.setMode('area'));
        
        document.getElementById('roadmap-style').addEventListener('click', () => this.setMapStyle('roadmap'));
        document.getElementById('satellite-style').addEventListener('click', () => this.setMapStyle('satellite'));
        document.getElementById('dark-style').addEventListener('click', () => this.setMapStyle('dark'));

        document.getElementById('import-file').addEventListener('change', (event) => this.importData(event));

        this.map.addListener('click', (event) => {
            if (this.mode === 'pin') {
                this.showPinModal(event.latLng);
            } else if (this.mode === 'measure') {
                this.addMeasurePoint(event.latLng);
            } else if (this.mode === 'area') {
                this.addAreaPoint(event.latLng);
            }
        });
    }

    setMode(mode) {
        this.mode = mode;
        document.querySelectorAll('.mode-btn').forEach(btn => 
            btn.classList.remove('active'));
        document.getElementById(`${mode}-mode`).classList.add('active');
    }

    setMapStyle(style) {
        let mapStyle = [];
        if (style === 'satellite') {
            this.map.setMapTypeId('satellite');
        } else if (style === 'dark') {
            mapStyle = [
                { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
                { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
                { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] }
            ];
            this.map.setMapTypeId('roadmap');
        } else {
            this.map.setMapTypeId('roadmap');
        }
        this.map.setOptions({ styles: mapStyle });
        document.querySelectorAll('.style-btn').forEach(btn => 
            btn.classList.remove('active'));
        document.getElementById(`${style}-style`).classList.add('active');
    }

    async loadSavedLocations() {
        try {
            const response = await fetch('db/locations.json');
            if (!response.ok) {
                throw new Error('Failed to load locations');
            }
            const locations = await response.json();
            this.displayLocations(locations);
        } catch (error) {
            console.error('Error loading locations:', error);
            alert('Failed to load locations. Check the console for details.');
        }
    }

    displayLocations(locations) {
        const pinInfoContainer = document.getElementById('pin-info');
        pinInfoContainer.innerHTML = '<h3>Pinned Locations</h3>';

        locations.forEach(location => {
            const latLng = new google.maps.LatLng(location.latitude, location.longitude);
            const marker = new google.maps.Marker({
                map: this.map,
                position: latLng,
                title: location.name
            });
            this.markers.push(marker);

            const infoDiv = document.createElement('div');
            infoDiv.className = 'info-content';
            infoDiv.innerHTML = `
                <strong>${location.name}</strong><br>
                <b>Address:</b> ${location.address}<br>
                <b>Lat:</b> ${location.latitude.toFixed(6)}, <b>Lon:</b> ${location.longitude.toFixed(6)}<br>
                <button onclick="mapManager.centerMap(${location.latitude}, ${location.longitude})" class="center-btn">Center</button>
                <button onclick="mapManager.deletePin(${location.latitude}, ${location.longitude})" class="delete-btn">Delete</button>
            `;
            pinInfoContainer.appendChild(infoDiv);
        });
    }

    addMeasurePoint(latLng) {
        const point = {
            lat: latLng.lat(),
            lng: latLng.lng()
        };

        // Create a marker for the point
        const marker = new google.maps.Marker({
            position: latLng,
            map: this.map,
            label: {
                text: (this.measurePoints.length + 1).toString(),
                className: 'measure-marker'
            }
        });

        // Draw a polyline if there's a previous point
        if (this.measurePoints.length > 0) {
            const prevPoint = this.measurePoints[this.measurePoints.length - 1];
            const distance = google.maps.geometry.spherical.computeDistanceBetween(
                new google.maps.LatLng(prevPoint),
                new google.maps.LatLng(point)
            );

            const polyline = new google.maps.Polyline({
                path: [prevPoint, point],
                geodesic: true,
                strokeColor: '#dc3545',
                strokeOpacity: 0.7,
                strokeWeight: 3,
                map: this.map
            });

            this.measurePolylines.push(polyline);
            this.totalDistance += distance;
        }

        // Add the point and marker to the arrays
        this.measurePoints.push(point);
        this.measureMarkers.push(marker);

        // Update the measurement display
        this.updateMeasurementDisplay();
    }

    addMeasurePointFromInput() {
        const latInput = document.getElementById('measure-lat');
        const lngInput = document.getElementById('measure-lng');
        const errorDiv = document.getElementById('coord-error');
        
        latInput.classList.remove('input-error');
        lngInput.classList.remove('input-error');
        errorDiv.textContent = '';

        const lat = parseFloat(latInput.value);
        const lng = parseFloat(lngInput.value);

        if (isNaN(lat)) {
            latInput.classList.add('input-error');
            errorDiv.textContent = 'Latitude must be a number';
            return;
        }

        if (isNaN(lng)) {
            lngInput.classList.add('input-error');
            errorDiv.textContent = 'Longitude must be a number';
            return;
        }

        if (lat < -90 || lat > 90) {
            latInput.classList.add('input-error');
            errorDiv.textContent = 'Latitude must be between -90 and 90';
            return;
        }

        if (lng < -180 || lng > 180) {
            lngInput.classList.add('input-error');
            errorDiv.textContent = 'Longitude must be between -180 and 180';
            return;
        }

        this.addMeasurePoint(new google.maps.LatLng(lat, lng));
        latInput.value = '';
        lngInput.value = '';
    }

    updateMeasurementDisplay() {
        const segmentsDiv = document.getElementById('segments');
        segmentsDiv.innerHTML = '';

        let totalDistance = 0;

        this.measurePoints.forEach((point, index) => {
            const segmentDiv = document.createElement('div');
            segmentDiv.className = 'segment-item';
            segmentDiv.innerHTML = `📍 Point ${index + 1}:<br>
                <span class="coordinates-display">
                ${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}</span>`;

            if (index > 0) {
                const prevPoint = this.measurePoints[index - 1];
                const distance = google.maps.geometry.spherical.computeDistanceBetween(
                    new google.maps.LatLng(prevPoint),
                    new google.maps.LatLng(point)
                );
                totalDistance += distance;
                segmentDiv.innerHTML += `<br>➡️ Distance to Point ${index}: ${distance.toFixed(2)} meters`;
            }

            segmentsDiv.appendChild(segmentDiv);
        });

        // Display total distance
        document.getElementById('total-distance').textContent = totalDistance.toFixed(2);
    }

    clearMeasurements() {
        if (!confirm('Are you sure you want to clear measurements?')) return;
        this.measureMarkers.forEach(marker => marker.setMap(null));
        this.measurePolylines.forEach(polyline => polyline.setMap(null));
        this.measurePoints = [];
        this.measureMarkers = [];
        this.measurePolylines = [];
        this.totalDistance = 0;
        this.updateMeasurementDisplay();
    }

    showPinModal(latLng) {
        this.currentPinLocation = latLng;
        document.getElementById('modal-lat').textContent = latLng.lat().toFixed(6);
        document.getElementById('modal-lng').textContent = latLng.lng().toFixed(6);
        document.getElementById('pin-modal').style.display = 'block';
        
        new google.maps.Geocoder().geocode({ location: latLng }, (results, status) => {
            if (status === 'OK' && results[0]) {
                document.getElementById('pin-address').value = results[0].formatted_address;
            }
        });
    }

    saveCustomPin() {
        const nameInput = document.getElementById('pin-name');
        if (!nameInput.value.trim()) {
            alert('Please enter a name for the pin');
            return;
        }

        const pinInfo = {
            name: nameInput.value.trim(),
            address: document.getElementById('pin-address').value.trim(),
            landline: document.getElementById('pin-landline').value.trim(),
            latitude: this.currentPinLocation.lat(),
            longitude: this.currentPinLocation.lng()
        };

        const marker = new google.maps.Marker({
            map: this.map,
            position: this.currentPinLocation,
            title: pinInfo.name
        });

        this.markers.push(marker);
        this.savePinToStorage(pinInfo);
        this.displayPinInSidebar(pinInfo);
        this.closeModal();
    }

    savePinToStorage(pinInfo) {
        const savedPins = JSON.parse(localStorage.getItem('pinnedLocations') || '[]');
        savedPins.push(pinInfo);
        localStorage.setItem('pinnedLocations', JSON.stringify(savedPins));
    }

    deletePin(lat, lng) {
        if (!confirm('Are you sure you want to delete this pin?')) return;
        this.markers = this.markers.filter(marker => {
            const pos = marker.getPosition();
            const latDiff = Math.abs(pos.lat() - lat);
            const lngDiff = Math.abs(pos.lng() - lng);
            
            if (latDiff < MapManager.EPSILON && lngDiff < MapManager.EPSILON) {
                marker.setMap(null);
                return false;
            }
            return true;
        });

        const savedPins = JSON.parse(localStorage.getItem('pinnedLocations') || '[]');
        const filtered = savedPins.filter(pin => {
            const latDiff = Math.abs(pin.latitude - lat);
            const lngDiff = Math.abs(pin.longitude - lng);
            return !(latDiff < MapManager.EPSILON && lngDiff < MapManager.EPSILON);
        });
        
        localStorage.setItem('pinnedLocations', JSON.stringify(filtered));
        this.refreshPinDisplay();
    }

    refreshPinDisplay() {
        const container = document.getElementById('pin-info');
        container.innerHTML = '';
        this.loadSavedLocations();
    }

    centerMap(lat, lng) {
        this.map.panTo({ lat, lng });
    }

    closeModal() {
        document.getElementById('pin-modal').style.display = 'none';
        document.getElementById('pin-name').value = '';
        document.getElementById('pin-address').value = '';
        document.getElementById('pin-landline').value = '';
        this.currentPinLocation = null;
    }

    clearMap() {
        if (!confirm('Are you sure you want to clear all pins?')) return;
        this.markers.forEach(marker => marker.setMap(null));
        this.markers = [];
        localStorage.removeItem('pinnedLocations');
        this.refreshPinDisplay();
    }

    exportData() {
        const data = {
            pins: JSON.parse(localStorage.getItem('pinnedLocations') || '[]'),
            measurements: {
                points: this.measurePoints,
                totalDistance: this.totalDistance
            }
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'map-data.json';
        a.click();
        URL.revokeObjectURL(url);
    }

    importData(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                if (data.pins) {
                    localStorage.setItem('pinnedLocations', JSON.stringify(data.pins));
                    this.refreshPinDisplay();
                }
                if (data.measurements) {
                    this.measurePoints = data.measurements.points;
                    this.totalDistance = data.measurements.totalDistance;
                    this.updateMeasurementDisplay();
                }
            } catch (error) {
                console.error('Error importing data:', error);
                alert('Failed to import data. Check the console for details.');
            }
        };
        reader.readAsText(file);
    }

    centerOnUserLocation() {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const userLocation = {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude
                    };
                    this.map.panTo(userLocation);
                    this.map.setZoom(15);
                },
                (error) => {
                    console.error('Error getting user location:', error);
                    alert('Failed to get your location. Please enable location services.');
                }
            );
        } else {
            alert('Geolocation is not supported by your browser.');
        }
    }

    searchLocation() {
        const query = document.getElementById('search-input').value;
        if (!query) return;

        const request = {
            query: query,
            fields: ['name', 'geometry']
        };

        const service = new google.maps.places.PlacesService(this.map);
        service.findPlaceFromQuery(request, (results, status) => {
            if (status === google.maps.places.PlacesServiceStatus.OK && results[0]) {
                const place = results[0];
                this.map.panTo(place.geometry.location);
                this.map.setZoom(15);
            } else {
                alert('Location not found. Please try a different search.');
            }
        });
    }

    undoLastPoint() {
        if (this.measurePoints.length === 0) return;

        const lastPoint = this.measurePoints.pop();
        const lastMarker = this.measureMarkers.pop();
        const lastPolyline = this.measurePolylines.pop();

        if (lastMarker) lastMarker.setMap(null);
        if (lastPolyline) lastPolyline.setMap(null);

        this.undoStack.push({ point: lastPoint, marker: lastMarker, polyline: lastPolyline });
        this.updateMeasurementDisplay();
    }

    redoLastPoint() {
        if (this.undoStack.length === 0) return;

        const { point, marker, polyline } = this.undoStack.pop();
        this.measurePoints.push(point);
        this.measureMarkers.push(marker);
        this.measurePolylines.push(polyline);

        if (marker) marker.setMap(this.map);
        if (polyline) polyline.setMap(this.map);

        this.updateMeasurementDisplay();
    }
}

const mapManager = new MapManager();
function initMap() {
    mapManager.initMap();
}