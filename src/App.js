// D:\New folder\Web page\employee-tracker-web\src\App.js

import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup } from 'react-leaflet';
import haversine from 'haversine';
import 'leaflet/dist/leaflet.css';
import './App.css';
import L from 'leaflet';

import { supabase } from './supabase';
import { snapToRoad } from './utils/mapbox';

// Fix default Leaflet icon URLs
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});

// Calculate total distance over original points using haversine between consecutive coords
function calculateTotalDistance(coords) {
  if (!Array.isArray(coords) || coords.length < 2) return '0.00';

  let distance = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i];
    const b = coords[i + 1];

    if (
      !a ||
      !b ||
      typeof a.latitude !== 'number' ||
      typeof a.longitude !== 'number' ||
      typeof b.latitude !== 'number' ||
      typeof b.longitude !== 'number'
    )
      continue;

    distance += haversine(
      { latitude: a.latitude, longitude: a.longitude },
      { latitude: b.latitude, longitude: b.longitude },
      { unit: 'km' }
    );
  }

  return distance.toFixed(2);
}

// Calculate speed between two points (km/h)
function calculateSpeed(from, to) {
  const distanceKm = haversine(from, to, { unit: 'km' });
  const timeDiff = (new Date(to.timestamp) - new Date(from.timestamp)) / 3600000; // hours
  if (!timeDiff || timeDiff <= 0) return 0;
  return distanceKm / timeDiff;
}

// Determine stop based on distance <= 50m and time >= 5 minutes
function isStop(current, previous) {
  const distanceM = haversine(current, previous, { unit: 'meter' });
  const timeDiff = (new Date(current.timestamp) - new Date(previous.timestamp)) / 60000; // minutes
  return distanceM <= 50 && timeDiff >= 5;
}

// Get start/end date based on filter option
function getDateRange(option) {
  const now = new Date();
  const start = new Date();
  const end = new Date();

  if (option === 'today') {
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
  } else if (option === 'yesterday') {
    start.setDate(now.getDate() - 1);
    end.setDate(now.getDate() - 1);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
  }

  return { start, end };
}

function App() {
  const [coordinates, setCoordinates] = useState([]); // Original DB points for markers/stops
  const [polylineCoords, setPolylineCoords] = useState([]); // Snapped points for polyline only
  const [distance, setDistance] = useState('0.00');
  const [stops, setStops] = useState([]);
  const [startTime, setStartTime] = useState(null);
  const [endTime, setEndTime] = useState(null);
  const [filter, setFilter] = useState('today');
  const [trackingIds, setTrackingIds] = useState([]);
  const [selectedTrackingId, setSelectedTrackingId] = useState('All');

  // Fetch unique tracking IDs for dropdown once on mount
  useEffect(() => {
    async function fetchTrackingIds() {
      const { data, error } = await supabase
        .from('locations')
        .select('tracking_id')
        .neq('tracking_id', null);

      if (error) {
        console.error('❌ Supabase tracking_id fetch error:', error);
        setTrackingIds([]);
        return;
      }

      const uniqueIds = Array.from(new Set(data.map((d) => d.tracking_id)));
      setTrackingIds(['All', ...uniqueIds]);
    }

    fetchTrackingIds();
  }, []);

  // Fetch coordinate data based on date filter and tracking ID selection
  useEffect(() => {
    const fetchData = async () => {
      // Clear existing data while fetching
      setCoordinates([]);
      setPolylineCoords([]);
      setStops([]);
      setDistance('0.00');
      setStartTime(null);
      setEndTime(null);

      const { start, end } = getDateRange(filter);
      const fromTime = start.toISOString();
      const toTime = end.toISOString();

      try {
        let query = supabase
          .from('locations')
          .select('latitude, longitude, timestamp, tracking_id, address')
          .gte('timestamp', fromTime)
          .lte('timestamp', toTime)
          .order('timestamp', { ascending: true });

        if (selectedTrackingId !== 'All') {
          query = query.eq('tracking_id', selectedTrackingId);
        }

        const { data, error } = await query;
        if (error) throw error;

        // Filter out invalid points
        const validCoords = data.filter(
          (pt) =>
            typeof pt.latitude === 'number' &&
            typeof pt.longitude === 'number' &&
            !isNaN(pt.latitude) &&
            !isNaN(pt.longitude)
        );

        if (validCoords.length === 0) {
          // No data available
          setCoordinates([]);
          setPolylineCoords([]);
          setDistance('0.00');
          setStartTime(null);
          setEndTime(null);
          setStops([]);
          return;
        }

        // Snap line for polyline ONLY - no merging of metadata to snapped points
        const snappedLineCoords = await snapToRoad(validCoords);

        setCoordinates(validCoords); // markers & stops use original points
        setPolylineCoords(snappedLineCoords); // polyline uses snapped points

        setDistance(calculateTotalDistance(validCoords));

        setStartTime(validCoords[0].timestamp);
        setEndTime(validCoords[validCoords.length - 1].timestamp);

        // Calculate stops based on original points for accurate metadata
        const detectedStops = [];
        for (let i = 1; i < validCoords.length; i++) {
          if (isStop(validCoords[i], validCoords[i - 1])) {
            detectedStops.push(validCoords[i]);
          }
        }
        setStops(detectedStops);
      } catch (error) {
        console.error('❌ Error fetching or processing data:', error);
        setCoordinates([]);
        setPolylineCoords([]);
        setStops([]);
        setDistance('0.00');
        setStartTime(null);
        setEndTime(null);
      }
    };

    fetchData();
  }, [filter, selectedTrackingId]); // refetch on filter or tracking ID change

  // Prepare polyline positions from snapped coords
  const polylinePositions = polylineCoords.map((c) => [c.latitude, c.longitude]);

  return (
    <div style={{ height: '100vh', width: '100%' }}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'center',
          alignItems: 'center',
          gap: '20px',
          padding: '10px',
          background: '#f6f8fa',
          borderBottom: '1px solid #ddd',
        }}
      >
        <div>
          <h2 style={{ margin: 0 }}>Distance: {distance} km</h2>
          {startTime && endTime && (
            <span>
              <strong>Start:</strong> {new Date(startTime).toLocaleString()} &nbsp; | &nbsp;
              <strong>End:</strong> {new Date(endTime).toLocaleString()}
            </span>
          )}
        </div>
        <div>
          <label htmlFor="date-filter">Date: </label>
          <select
            id="date-filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{ padding: '6px', marginRight: '10px' }}
          >
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
          </select>
        </div>
        <div>
          <label htmlFor="tid-filter">Tracking ID: </label>
          <select
            id="tid-filter"
            value={selectedTrackingId}
            onChange={(e) => setSelectedTrackingId(e.target.value)}
            style={{ padding: '6px' }}
          >
            {trackingIds.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </div>
      </div>

      {polylinePositions.length > 0 ? (
        <MapContainer
          center={polylinePositions[0]}
          zoom={15}
          style={{ height: '85%', width: '100%' }}
        >
          <TileLayer
            attribution="&copy; OpenStreetMap contributors"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Polyline positions={polylinePositions} color="blue" />

          {/* Markers from original DB points for metadata */}
          {coordinates.map((coord, index) => {
            const position = [coord.latitude, coord.longitude];
            const timestamp = new Date(coord.timestamp).toLocaleString();

            let speedLabel = '';
            if (index > 0) {
              const speed = calculateSpeed(coordinates[index - 1], coord);
              speedLabel = speed < 5 ? 'Walking' : 'Vehicle';
            }

            return (
              <Marker key={index} position={position}>
                <Popup>
                  <strong>Point {index + 1}</strong>
                  <br />
                  Tracking ID: {coord.tracking_id}
                  <br />
                  Address: {coord.address ? coord.address : 'N/A'}
                  <br />
                  Time: {timestamp}
                  <br />
                  Mode: {speedLabel}
                </Popup>
              </Marker>
            );
          })}

          {/* Stops from original points */}
          {stops.map((stop, index) => (
            <Marker key={`stop-${index}`} position={[stop.latitude, stop.longitude]}>
              <Popup>
                <strong>Stopped Here</strong>
                <br />
                Tracking ID: {stop.tracking_id}
                <br />
                Address: {stop.address ? stop.address : 'N/A'}
                <br />
                Time: {new Date(stop.timestamp).toLocaleString()}
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      ) : (
        <p
          style={{
            textAlign: 'center',
            padding: '2em',
            fontSize: '1.1em',
            color: '#888',
          }}
        >
          Loading route...
        </p>
      )}
    </div>
  );
}

export default App;
