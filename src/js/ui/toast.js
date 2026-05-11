// @ts-check

import { escapeHTML } from '../core/utils.js';

/** @typedef {'info' | 'success' | 'warning' | 'error'} ToastType */

/** @type {Readonly<Record<ToastType, string>>} */
const TOAST_ICONS = {
  success: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>',
  error: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5"><path stroke-linecap="round" stroke-linejoin="round" d="m9.75 9.75 4.5 4.5m0-4.5-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>',
  warning: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" /></svg>',
  info: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5"><path stroke-linecap="round" stroke-linejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" /></svg>',
};

/**
 * OpticPress premium toast notification system.
 * Example: `showToast("Saved", "success")`.
 * @param {string} message
 * @param {ToastType} [type]
 */
export function showToast(message, type = 'info') {
  const container = getToastContainer();
  container.innerHTML = '';

  const safeType = type in TOAST_ICONS ? type : 'info';
  const toast = document.createElement('div');
  toast.className = `optic-toast optic-toast-${safeType}`;
  toast.innerHTML = `
    <div class="flex-shrink-0">${TOAST_ICONS[safeType]}</div>
    <span class="text-sm font-semibold tracking-wide whitespace-normal sm:whitespace-nowrap">${escapeHTML(message)}</span>
    <div class="optic-toast-progress"></div>
  `;

  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('is-visible'));
  bindAutoDismiss(toast);
}

/** @returns {HTMLElement} */
function getToastContainer() {
  const existing = document.getElementById('optic-toast-container');
  if (existing) return existing;

  const container = document.createElement('div');
  container.id = 'optic-toast-container';
  document.body.appendChild(container);
  return container;
}

/** @param {HTMLElement} toast */
function bindAutoDismiss(toast) {
  const cleanup = () => {
    toast.classList.remove('is-visible');
    setTimeout(() => toast.remove(), 500);
  };
  const timer = setTimeout(cleanup, 3000);

  toast.onmouseenter = () => {
    clearTimeout(timer);
    const progress = toast.querySelector('.optic-toast-progress');
    if (progress instanceof HTMLElement) progress.style.animationPlayState = 'paused';
  };

  toast.onmouseleave = () => {
    setTimeout(cleanup, 1000);
    const progress = toast.querySelector('.optic-toast-progress');
    if (progress instanceof HTMLElement) progress.style.animationPlayState = 'running';
  };
}
