const apiKey = import.meta.env.VITE_MAPTILER_API_KEY || '';

/**
 * Searches for locations matching the given query using MapTiler's Geocoding API.
 * @param {string} query The location search query.
 * @returns {Promise<Array<{name: string, lng: number, lat: number}>>}
 */
export async function searchLocations(query) {
  if (!query || query.trim().length < 2) return [];

  // Try MapTiler if API key is configured
  if (apiKey) {
    try {
      const url = `https://api.maptiler.com/geocoding/${encodeURIComponent(query.trim())}.json?key=${apiKey}&autocomplete=true&limit=8`;
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        if (data.features && data.features.length > 0) {
          return data.features.map(feat => ({
            name: feat.place_name,
            lng: feat.center[0],
            lat: feat.center[1]
          }));
        }
      }
    } catch (e) {
      console.warn("MapTiler geocoding unavailable, trying fallback:", e);
    }
  }

  // Free, keyless OpenStreetMap Nominatim global fallback
  try {
    const nomUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query.trim())}&limit=8`;
    const response = await fetch(nomUrl, { 
      headers: { 
        'Accept-Language': 'en',
        'User-Agent': 'GreenMove-App/1.0'
      } 
    });
    if (response.ok) {
      const data = await response.json();
      if (data && data.length > 0) {
        return data.map(item => ({
          name: item.display_name,
          lng: parseFloat(item.lon),
          lat: parseFloat(item.lat)
        }));
      }
    }
  } catch (e) {
    console.warn("Nominatim geocoding error:", e);
  }

  return [];
}

/**
 * Translates longitude/latitude coordinates into a readable place name.
 * @param {number} lng Longitude.
 * @param {number} lat Latitude.
 * @returns {Promise<string>}
 */
export async function reverseGeocode(lng, lat) {
  if (apiKey) {
    const url = `https://api.maptiler.com/geocoding/${lng},${lat}.json?key=${apiKey}&limit=1`;
    try {
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        if (data.features && data.features.length > 0) {
          return data.features[0].place_name;
        }
      }
    } catch (error) {
      console.error("Reverse geocoding error:", error);
    }
  }

  try {
    const nomUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`;
    const response = await fetch(nomUrl, { headers: { 'Accept-Language': 'en' } });
    if (response.ok) {
      const data = await response.json();
      if (data && data.display_name) {
        return data.display_name;
      }
    }
  } catch (e) {
    // fallback
  }

  return "Current Location";
}
