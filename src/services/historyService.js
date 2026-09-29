import { API_BASE_URL as BACKEND_API_BASE } from '../config';
const STORAGE_KEY = 'greenmove_journey_history';
const USER_KEY_ID = 'greenmove_user_id';
const USER_KEY_NAME = 'greenmove_user_name';

/**
 * Get the current user identity from local storage if available.
 * Defaults to logged-in user 'Rahul' (usr_rahul_indore) or custom session profile.
 */
export function getCurrentUser() {
  const storedId = localStorage.getItem(USER_KEY_ID);
  const storedName = localStorage.getItem(USER_KEY_NAME);
  if (storedId && storedName) {
    return { id: storedId, name: storedName };
  }
  return { id: 'usr_rahul_indore', name: 'Rahul' };
}

/**
 * Sets the current authenticated user session identity.
 */
export function setCurrentUser(userId, userName) {
  if (userId && userName) {
    localStorage.setItem(USER_KEY_ID, userId);
    localStorage.setItem(USER_KEY_NAME, userName);
  }
}

/**
 * Retrieve all saved journey history records from shared Spring Boot backend.
 */
export async function getJourneysFromBackend() {
  try {
    const res = await fetch(`${BACKEND_API_BASE}/journeys`);
    if (res.ok) {
      const data = await res.json();
      return data.map(mapBackendEntityToRecord);
    }
  } catch (err) {
    console.warn('Backend REST endpoint unavailable, falling back to local cache:', err);
  }
  return getJourneys();
}

/**
 * Retrieve carpool candidate journeys for other users from shared Spring Boot backend.
 */
export async function getCarpoolCandidatesFromBackend(userId) {
  try {
    const res = await fetch(`${BACKEND_API_BASE}/carpools/matches?userId=${encodeURIComponent(userId)}`);
    if (res.ok) {
      const data = await res.json();
      return data.map(mapBackendEntityToRecord);
    }
  } catch (err) {
    console.warn('Backend Carpool API unavailable, falling back to local filter:', err);
  }
  const local = getJourneys();
  return local.filter(j => j.userId !== userId);
}

/**
 * Maps backend JourneyEntity fields to frontend record format.
 */
function mapBackendEntityToRecord(entity) {
  const dateObj = entity.createdAt ? new Date(entity.createdAt) : new Date();
  return {
    id: entity.id,
    userId: entity.userId,
    userName: entity.userName,
    timestamp: dateObj.getTime(),
    dateFormatted: dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    timeFormatted: dateObj.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
    title: `${entity.originName} to ${entity.destinationName}`,
    origin: { name: entity.originName, lat: entity.originLat, lng: entity.originLng },
    destination: { name: entity.destinationName, lat: entity.destinationLat, lng: entity.destinationLng },
    mode: entity.mode,
    distanceKmNum: entity.distanceKm,
    distanceKm: `${entity.distanceKm} km`,
    durationMinutes: entity.durationMinutes || '15 min',
    costInr: entity.costInr,
    costFormatted: `₹${entity.costInr}`,
    co2Kg: entity.co2Kg,
    co2Formatted: `${entity.co2Kg} kg`,
    passengers: entity.passengers,
    status: entity.status || 'PLANNED'
  };
}

/**
 * Retrieve local cached journey records.
 */
export function getJourneys() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('Failed to parse journey history from localStorage:', err);
    return [];
  }
}

/**
 * Save a new journey record to shared Spring Boot database and local cache.
 */
export function saveJourney(journeyData) {
  if (!journeyData) return null;

  const currentUser = getCurrentUser();
  const now = journeyData.timestamp || Date.now();
  const dateObj = new Date(now);

  const dateFormatted = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const timeFormatted = dateObj.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

  const origName = typeof journeyData.origin === 'object' ? (journeyData.origin.name || 'Origin') : (journeyData.origin || 'Origin');
  const destName = typeof journeyData.destination === 'object' ? (journeyData.destination.name || 'Destination') : (journeyData.destination || 'Destination');

  const origLat = typeof journeyData.origin === 'object' ? (journeyData.origin.lat || 22.75) : 22.75;
  const origLng = typeof journeyData.origin === 'object' ? (journeyData.origin.lng || 75.89) : 75.89;
  const destLat = typeof journeyData.destination === 'object' ? (journeyData.destination.lat || 22.65) : 22.65;
  const destLng = typeof journeyData.destination === 'object' ? (journeyData.destination.lng || 75.85) : 75.85;

  const origShort = origName.split(',')[0].trim();
  const destShort = destName.split(',')[0].trim();
  const title = `${origShort} to ${destShort}`;

  const mode = (journeyData.mode || 'DRIVING').toUpperCase();
  const distKmNum = Number(journeyData.distanceKmNum || (journeyData.distanceMeters ? journeyData.distanceMeters / 1000 : 10));
  const distKmStr = `${distKmNum.toFixed(1)} km`;

  const cost = typeof journeyData.costInr === 'number' ? journeyData.costInr : Math.round(distKmNum * 8.5);
  const co2 = typeof journeyData.co2Kg === 'number' ? journeyData.co2Kg : Number((distKmNum * 0.201).toFixed(2));
  const passengers = journeyData.passengers || (mode === 'CARPOOL' ? 2 : 1);

  const newId = `journey_${now}_${Math.random().toString(36).substring(2, 7)}`;
  const userId = journeyData.userId || currentUser.id;
  const userName = journeyData.userName || currentUser.name;

  const backendEntity = {
    id: newId,
    userId: userId,
    userName: userName,
    originName: origName,
    originLat: origLat,
    originLng: origLng,
    destinationName: destName,
    destinationLat: destLat,
    destinationLng: destLng,
    mode: mode === 'DRIVING' && passengers > 1 ? 'CARPOOL' : mode,
    distanceKm: distKmNum,
    durationMinutes: journeyData.durationMinutes || '15 min',
    costInr: cost,
    co2Kg: co2,
    passengers: passengers,
    status: journeyData.status || 'PLANNED'
  };

  // Asynchronously persist to Spring Boot REST backend
  fetch(`${BACKEND_API_BASE}/journeys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(backendEntity)
  }).then(res => res.json())
    .then(data => console.log('Successfully persisted journey to Spring Boot shared DB:', data))
    .catch(err => console.warn('Could not post journey to backend API:', err));

  const newRecord = {
    id: newId,
    userId: userId,
    userName: userName,
    timestamp: now,
    dateFormatted,
    timeFormatted,
    title,
    origin: { name: origName, lat: origLat, lng: origLng },
    destination: { name: destName, lat: destLat, lng: destLng },
    mode: mode === 'DRIVING' && passengers > 1 ? 'CARPOOL' : mode,
    distanceKmNum: distKmNum,
    distanceKm: distKmStr,
    durationMinutes: journeyData.durationMinutes || '15 min',
    costInr: cost,
    costFormatted: `₹${cost}`,
    co2Kg: co2,
    co2Formatted: `${co2.toFixed(2)} kg`,
    passengers: passengers,
    status: journeyData.status || 'PLANNED'
  };

  try {
    const existing = getJourneys();
    existing.unshift(newRecord);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
    return newRecord;
  } catch (err) {
    console.error('Failed to save journey to localStorage:', err);
    return null;
  }
}
