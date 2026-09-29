import { API_BASE_URL } from '../config';
import { getToken } from './authService';

function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function parseResponse(res) {
  if (res.status === 204) return null;
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const errBody = await res.json();
      if (errBody.message) msg = errBody.message;
    } catch (e) {}
    throw new Error(msg);
  }
  return res.json();
}

export async function getMyImpact() {
  const res = await fetch(`${API_BASE_URL}/impact/me`, {
    headers: authHeaders()
  });
  return parseResponse(res);
}
