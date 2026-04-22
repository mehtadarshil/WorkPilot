const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000/api';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface RequestOptions extends RequestInit {
  method?: HttpMethod;
  authToken?: string | null;
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

  const contentType = response.headers.get('content-type');
  const isJson = contentType && contentType.includes('application/json');
  const data = isJson ? await response.json() : null;

  if (!response.ok) {
    if (response.status === 401 && typeof window !== 'undefined') {
      window.localStorage.removeItem('wp_token');
      window.localStorage.removeItem('wp_user');
      window.location.href = '/login';
    }
    const message = (data && (data.message as string)) || 'Unexpected error occurred';
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
  const response = await fetch(url, { method: 'GET', headers });
  if (!response.ok) {
    if (response.status === 401 && typeof window !== 'undefined') {
      window.localStorage.removeItem('wp_token');
      window.localStorage.removeItem('wp_user');
      window.location.href = '/login';
    }
    let message = 'Unexpected error occurred';
    try {
      const data = await response.json();
      if (data && typeof data.message === 'string') message = data.message;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  return response.blob();
}

