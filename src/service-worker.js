/**
 * AkiCrop – Minimal service worker for offline caching (optional for Add to Home Screen).
 */
import { base, build, files, version } from '$service-worker';

const CACHE = `akicrop-${version}`;

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches.open(CACHE).then((cache) => cache.addAll([...build, ...files]))
	);
	self.skipWaiting();
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches.keys().then((keys) =>
			Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
		)
	);
	self.clients.claim();
});

self.addEventListener('fetch', (event) => {
	if (event.request.method !== 'GET') return;
	const url = new URL(event.request.url);
	if (url.origin !== location.origin || !url.pathname.startsWith(base)) return;
	event.respondWith(
		caches.match(event.request).then((cached) => cached || fetch(event.request))
	);
});
