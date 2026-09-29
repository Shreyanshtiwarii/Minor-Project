// Centralized API configuration for production Vercel & Render deployment
const rawBaseUrl = import.meta.env.VITE_API_BASE_URL || '';
export const API_BASE_URL = rawBaseUrl
  ? `${rawBaseUrl.replace(/\/$/, '')}/api/v1`
  : 'http://localhost:8080/api/v1';
