// utils/mapbox.js
import axios from 'axios';

const MAPBOX_TOKEN = 'pk.eyJ1IjoiY3licml4IiwiYSI6ImNtZGhvZXB1ZjAzYmcyanNoYzlyMG5kdm8ifQ.7eaEBVIX4JgCiKZ1oOzjpQ';

export async function snapToRoad(coords) {
  if (coords.length < 2) return coords;

  const coordString = coords.map(p => `${p.longitude},${p.latitude}`).join(';');

  // Add overview=full&steps=true for better snapping
  const url = `https://api.mapbox.com/matching/v5/mapbox/driving/${coordString}?geometries=geojson&overview=full&steps=true&access_token=${MAPBOX_TOKEN}`;

  try {
    const response = await axios.get(url);
    const matchings = response.data.matchings;

    if (!matchings || matchings.length === 0) {
      // Could not match, fallback to original coords
      return coords;
    }

    // Concatenate all matched segments' coordinates
    let allCoords = [];
    matchings.forEach(matching => {
      if (matching.geometry && matching.geometry.coordinates) {
        allCoords = allCoords.concat(matching.geometry.coordinates);
      }
    });

    // Remove consecutive duplicate points to avoid duplicates
    const uniqueCoords = allCoords.filter((coord, index, self) =>
      index === 0 || coord[0] !== self[index - 1][0] || coord[1] !== self[index - 1][1]
    );

    // Return snapped points with latitude and longitude only (used for polyline)
    return uniqueCoords.map(([lng, lat]) => ({
      latitude: lat,
      longitude: lng,
    }));

  } catch (error) {
    console.error('❌ Mapbox snap error:', error);
    return coords;
  }
}
