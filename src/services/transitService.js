/**
 * Calculates a public transit itinerary between two points.
 * Queries the Spring Boot backend transit endpoint (which proxies OpenTripPlanner + GTFS).
 * @param {Object} origin Coordinates of origin { lat, lng }
 * @param {Object} destination Coordinates of destination { lat, lng }
 * @returns {Promise<Object>} Promise resolving to transit route or rejecting indicating transit is unavailable.
 */
export async function getTransitRoute(origin, destination) {
  try {
    const backendUrl = "http://localhost:8080/api/v1/transit/plan";
    const res = await fetch(backendUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        origin: { lat: origin.lat, lng: origin.lng },
        destination: { lat: destination.lat, lng: destination.lng }
      })
    });

    if (res.ok) {
      const data = await res.json();
      if (data && data.success && data.primaryRoute) {
        return data.primaryRoute;
      }
      if (data && data.message) {
        throw new Error(data.message);
      }
    }
  } catch (err) {
    if (err.message && err.message.includes("Public transit")) {
      throw err;
    }
    console.info("[transitService] Transit backend service unconfigured:", err.message);
  }

  // Graceful rejection when GTFS feed / OTP server is unconfigured
  // DO NOT fabricate mock transit data in accordance with project rules.
  throw new Error("Public transit routing is currently unavailable. No GTFS feed or OpenTripPlanner backend is configured.");
}
