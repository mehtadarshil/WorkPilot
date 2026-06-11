const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || '/api';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface RequestOptions extends RequestInit {
  method?: HttpMethod;
  authToken?: string | null;
}

let activeRefreshPromise: Promise<{ token: string; refreshToken?: string }> | null = null;

async function performTokenRefresh(refreshToken: string): Promise<{ token: string; refreshToken?: string }> {
  const url = `${API_BASE_URL}/auth/refresh`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ refreshToken }),
  });
  if (!response.ok) {
    throw new Error('Refresh request failed');
  }
  return response.json() as Promise<{ token: string; refreshToken?: string }>;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const url = `${API_BASE_URL}${path}`;

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (options.authToken) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${options.authToken}`;
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  let contentType = response.headers.get('content-type');
  let isJson = contentType && contentType.includes('application/json');
  let data = isJson ? await response.json() : null;

  if (!response.ok) {
    const message = (data && (data.message as string)) || 'Unexpected error occurred';
    const isLoginRequest = path === '/auth/login' || path.endsWith('/auth/login');

    if (response.status === 401 && typeof window !== 'undefined' && !isLoginRequest && !path.endsWith('/auth/refresh')) {
      const refreshToken = window.localStorage.getItem('wp_refresh_token');
      if (refreshToken) {
        try {
          if (!activeRefreshPromise) {
            activeRefreshPromise = performTokenRefresh(refreshToken);
          }
          const refreshData = await activeRefreshPromise;
          activeRefreshPromise = null;

          window.localStorage.setItem('wp_token', refreshData.token);
          if (refreshData.refreshToken) {
            window.localStorage.setItem('wp_refresh_token', refreshData.refreshToken);
          }

          // Retry the request with the new token
          const newHeaders = {
            ...headers,
            'Authorization': `Bearer ${refreshData.token}`,
          } as Record<string, string>;

          const retryResponse = await fetch(url, {
            ...options,
            headers: newHeaders,
          });

          const retryContentType = retryResponse.headers.get('content-type');
          const isRetryJson = retryContentType && retryContentType.includes('application/json');
          const retryData = isRetryJson ? await retryResponse.json() : null;

          if (!retryResponse.ok) {
            const retryMessage = (retryData && (retryData.message as string)) || 'Unexpected error occurred';
            throw new Error(retryMessage);
          }

          return retryData as T;
        } catch (refreshError) {
          activeRefreshPromise = null;
          console.error('Auto token refresh failed:', refreshError);
        }
      }

      window.localStorage.removeItem('wp_token');
      window.localStorage.removeItem('wp_refresh_token');
      window.localStorage.removeItem('wp_user');
      if (!window.location.pathname.startsWith('/login')) {
        const q = new URLSearchParams({ error: 'Your session has expired. Please sign in again.' });
        window.location.href = `/login?${q.toString()}`;
      }
      throw new Error('Session expired');
    }

    throw new Error(message);
  }

  return data as T;
}

export function postJson<TResponse, TBody = unknown>(path: string, body: TBody, authToken?: string | null) {
  return request<TResponse>(path, {
    method: 'POST',
    body: JSON.stringify(body),
    authToken,
  });
}

export function getJson<TResponse>(path: string, authToken?: string | null) {
  return request<TResponse>(path, {
    method: 'GET',
    authToken,
  });
}

export function patchJson<TResponse, TBody = unknown>(path: string, body: TBody, authToken?: string | null) {
  return request<TResponse>(path, {
    method: 'PATCH',
    body: JSON.stringify(body),
    authToken,
  });
}

export function putJson<TResponse, TBody = unknown>(path: string, body: TBody, authToken?: string | null) {
  return request<TResponse>(path, {
    method: 'PUT',
    body: JSON.stringify(body),
    authToken,
  });
}

export function deleteRequest(path: string, authToken?: string | null) {
  return request<undefined>(path, {
    method: 'DELETE',
    authToken,
  });
}

/** Binary GET (e.g. file download); caller should revoke any created object URLs. */
export async function getBlob(path: string, authToken?: string | null): Promise<Blob> {
  const url = `${API_BASE_URL}${path}`;
  const headers: HeadersInit = {};
  if (authToken) (headers as Record<string, string>).Authorization = `Bearer ${authToken}`;
  
  let response = await fetch(url, { method: 'GET', headers });

  if (response.status === 401 && typeof window !== 'undefined') {
    const refreshToken = window.localStorage.getItem('wp_refresh_token');
    if (refreshToken) {
      try {
        if (!activeRefreshPromise) {
          activeRefreshPromise = performTokenRefresh(refreshToken);
        }
        const refreshData = await activeRefreshPromise;
        activeRefreshPromise = null;

        window.localStorage.setItem('wp_token', refreshData.token);
        if (refreshData.refreshToken) {
          window.localStorage.setItem('wp_refresh_token', refreshData.refreshToken);
        }

        (headers as Record<string, string>).Authorization = `Bearer ${refreshData.token}`;
        response = await fetch(url, { method: 'GET', headers });
      } catch (err) {
        activeRefreshPromise = null;
        console.error('Auto token refresh failed in getBlob:', err);
      }
    }
  }

  if (!response.ok) {
    let message = 'Unexpected error occurred';
    try {
      const data = await response.json();
      if (data && typeof data.message === 'string') message = data.message;
    } catch {
      /* ignore */
    }
    if (response.status === 401 && typeof window !== 'undefined') {
      window.localStorage.removeItem('wp_token');
      window.localStorage.removeItem('wp_refresh_token');
      window.localStorage.removeItem('wp_user');
      if (!window.location.pathname.startsWith('/login')) {
        const q = new URLSearchParams({ error: message });
        window.location.href = `/login?${q.toString()}`;
      }
    }
    throw new Error(message);
  }
  return response.blob();
}
