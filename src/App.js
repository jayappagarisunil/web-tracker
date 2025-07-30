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

function App() {
  // Set up state (fromDate and toDate default to today)
  const today = new Date();
  const pad = (n) => n.toString().padStart(2, '0');
  const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

  const [fromDate, setFromDate] = useState(todayStr);
  const [toDate, setToDate] = useState(todayStr);

  const [coordinates, setCoordinates] = useState([]); // Original DB points for markers/stops
  const [polylineCoords, setPolylineCoords] = useState([]); // Snapped points for polyline only
  const [distance, setDistance] = useState('0.00');
  const [stops, setStops] = useState([]);
  const [startTime, setStartTime] = useState(null);
  const [endTime, setEndTime] = useState(null);
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
      setCoordinates([]);
      setPolylineCoords([]);
      setStops([]);
      setDistance('0.00');
      setStartTime(null);
      setEndTime(null);

      // Combine from and to dates into ISO strings for querying
      const fromTime = new Date(`${fromDate}T00:00:00.000Z`).toISOString();
      const toTime = new Date(`${toDate}T23:59:59.999Z`).toISOString();

      try {
        let query = supabase
          .from('locations')
          .select('latitude, longitude, timestamp, tracking_id, address, battery_percentage, additional_data')
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
  }, [fromDate, toDate, selectedTrackingId]); // refetch on date/tracking ID change

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
          <label htmlFor="from-date">From: </label>
          <input
            id="from-date"
            type="date"
            value={fromDate}
            onChange={e => setFromDate(e.target.value)}
            style={{ marginRight: "10px" }}
            max={toDate}
          />
          <label htmlFor="to-date">To: </label>
          <input
            id="to-date"
            type="date"
            value={toDate}
            onChange={e => setToDate(e.target.value)}
            style={{ marginRight: "10px" }}
            min={fromDate}
          />
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

            // Parse additional_data if it's a string (in some setups, Supabase returns JSON as object, in others as string)
            let additionalData = coord.additional_data;
            if (additionalData && typeof additionalData === "string") {
              try {
                additionalData = JSON.parse(additionalData);
              } catch (e) {
                additionalData = {};
              }
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
                  <br />
                  Battery: {coord.battery_percentage != null ? `${coord.battery_percentage}%` : "N/A"}
                  <br />
                  Device Model: {additionalData && additionalData.model ? additionalData.model : "N/A"}
                  {/* You can add more fields if desired, e.g. OS, internet type, etc. */}
                  {additionalData && (
                    <>
                      <br />
                      OS: {additionalData.os_name ? additionalData.os_name : "N/A"}
                      <br />
                      OS Version: {additionalData.os_version ? additionalData.os_version : "N/A"}
                      <br />
                      Internet: {additionalData.internet ? additionalData.internet : "N/A"}
                      <br />
                      GPS Enabled: {typeof additionalData.gps_enabled === 'boolean' ? (additionalData.gps_enabled ? 'Yes' : 'No') : "N/A"}
                    </>
                  )}
                </Popup>
              </Marker>
            );
          })}

          {/* Stops from original points */}
          {stops.map((stop, index) => {
            // Parse additional_data in case it's a string
            let additionalData = stop.additional_data;
            if (additionalData && typeof additionalData === "string") {
              try {
                additionalData = JSON.parse(additionalData);
              } catch (e) {
                additionalData = {};
              }
            }
            return (
              <Marker key={`stop-${index}`} position={[stop.latitude, stop.longitude]}>
                <Popup>
                  <strong>Stopped Here</strong>
                  <br />
                  Tracking ID: {stop.tracking_id}
                  <br />
                  Address: {stop.address ? stop.address : 'N/A'}
                  <br />
                  Time: {new Date(stop.timestamp).toLocaleString()}
                  <br />
                  Battery: {stop.battery_percentage != null ? `${stop.battery_percentage}%` : "N/A"}
                  <br />
                  Device Model: {additionalData && additionalData.model ? additionalData.model : "N/A"}
                  {additionalData && (
                    <>
                      <br />
                      OS: {additionalData.os_name ? additionalData.os_name : "N/A"}
                      <br />
                      OS Version: {additionalData.os_version ? additionalData.os_version : "N/A"}
                      <br />
                      Internet: {additionalData.internet ? additionalData.internet : "N/A"}
                      <br />
                      GPS Enabled: {typeof additionalData.gps_enabled === 'boolean' ? (additionalData.gps_enabled ? 'Yes' : 'No') : "N/A"}
                    </>
                  )}
                </Popup>
              </Marker>
            );
          })}
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
