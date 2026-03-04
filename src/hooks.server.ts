import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);
	// Explicitly allow Web Share API (required on some hosts / iOS)
	response.headers.set('Permissions-Policy', 'web-share=(self)');
	return response;
};
