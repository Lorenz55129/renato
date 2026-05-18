(function () {
  'use strict';

  const API_BASE = '/api';
  const TOKEN_KEY = 'renato_token';
  const USER_KEY = 'renato_user';

  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  function setAuth(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }

  function clearAuth() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  function getUser() {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  }

  async function apiCall(method, path, body) {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    const token = getToken();
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;
    if (body) opts.body = JSON.stringify(body);

    const res = await fetch(API_BASE + path, opts);

    if (res.status === 401) {
      clearAuth();
      window.App.Auth.showLogin();
      throw new Error('unauthorized');
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'unknown' }));
      throw new Error(err.error || 'api_error');
    }

    return res.json();
  }

  async function login(username, password) {
    const data = await apiCall('POST', '/login', { username, password });
    setAuth(data.token, data.user);
    return data;
  }

  async function verify() {
    return apiCall('POST', '/auth/verify');
  }

  async function changePassword(oldPwd, newPwd) {
    return apiCall('POST', '/auth/change-password', {
      old_password: oldPwd,
      new_password: newPwd,
    });
  }

  function logout() {
    clearAuth();
    window.location.reload();
  }

  window.App = window.App || {};
  window.App.Api = { apiCall, login, verify, changePassword, getToken, getUser, clearAuth, logout };
})();
