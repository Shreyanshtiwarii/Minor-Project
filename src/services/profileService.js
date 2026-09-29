import { API_BASE_URL } from '../config';
import { getToken } from './authService';

/**
 * API client for /api/v1/users/me/** (Profile Settings). Follows the same fetch/error-parsing
 * conventions as authService.js.
 */

async function parseResponse(res) {
  let body = null;
  try {
    body = await res.json();
  } catch {
    // no JSON body
  }
  if (!res.ok) {
    const message = body?.message || 'Something went wrong. Please try again.';
    throw new Error(message);
  }
  return body;
}

function authHeaders() {
  const token = getToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
}

export async function updateName(name) {
  const res = await fetch(`${API_BASE_URL}/users/me/name`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify({ name })
  });
  return parseResponse(res);
}

export async function changePassword({ currentPassword, newPassword, confirmPassword }) {
  const res = await fetch(`${API_BASE_URL}/users/me/password`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify({ currentPassword, newPassword, confirmPassword })
  });
  return parseResponse(res);
}

export async function requestEmailChange({ currentPassword, newEmail }) {
  const res = await fetch(`${API_BASE_URL}/users/me/email/change-request`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ currentPassword, newEmail })
  });
  return parseResponse(res);
}
